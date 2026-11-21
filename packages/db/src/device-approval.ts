import { appendAccessAuditChanges } from "./access-audit"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export type DeviceStatus = "pending" | "approved" | "revoked"

export type DeviceObservation = {
  code: string
  model: string | null
  platform: string | null
  platformVersion: string | null
  sessionId: string | null
  tokenHash: string
  userAgent: string | null
  userId: string
}

export type DeviceRecord = {
  awaitingFirstVisit: boolean
  isCurrent: boolean
  code: string
  firstSeenAt: Date
  id: string
  lastSeenAt: Date
  lastUserName: string | null
  model: string | null
  name: string | null
  platform: string | null
  platformVersion: string | null
  reviewedAt: Date | null
  reviewedByName: string | null
  status: DeviceStatus
  userAgent: string | null
}

type KnownDevice = {
  code: string
  id: string
  last_seen_at: string
  last_user_id: string | null
  model: string | null
  platform_version: string | null
  status: DeviceStatus
}

const refreshAfterMs = 10 * 60 * 1000

export function createDeviceApprovalRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  /** Claims a seeded row, merges a duplicate seed, inserts or refreshes. */
  async function record(
    input: DeviceObservation
  ): Promise<{ code: string; status: DeviceStatus }> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const seed = input.sessionId
        ? (
            await client.query<{
              code: string
              id: string
              name: string | null
              status: DeviceStatus
            }>(
              `SELECT id, code, name, status FROM identity.devices
               WHERE seed_session_id = $1 AND token_hash IS NULL FOR UPDATE`,
              [input.sessionId]
            )
          ).rows[0]
        : undefined
      const known = (
        await client.query<{ code: string; id: string; status: DeviceStatus }>(
          "SELECT id, code, status FROM identity.devices WHERE token_hash = $1 FOR UPDATE",
          [input.tokenHash]
        )
      ).rows[0]
      const seen = [
        input.userAgent?.slice(0, 400) ?? null,
        input.model,
        input.platform,
        input.platformVersion,
        input.userId,
      ]
      let device: { code: string; status: DeviceStatus }

      if (seed && !known) {
        device = seed
        await client.query(
          `UPDATE identity.devices
           SET token_hash = $2, seed_session_id = NULL, user_agent = $3,
             model = COALESCE($4, model), platform = COALESCE($5, platform),
             platform_version = COALESCE($6, platform_version),
             last_user_id = $7, last_seen_at = now()
           WHERE id = $1`,
          [seed.id, input.tokenHash, ...seen]
        )
      } else if (known) {
        // A seed approved before this browser was recognised carries over.
        device = {
          code: known.code,
          status:
            seed?.status === "approved" && known.status === "pending"
              ? "approved"
              : known.status,
        }
        if (seed) {
          await client.query("DELETE FROM identity.devices WHERE id = $1", [seed.id])
        }
        await client.query(
          `UPDATE identity.devices
           SET status = $2, name = COALESCE(name, $3), user_agent = $4,
             model = COALESCE($5, model), platform = COALESCE($6, platform),
             platform_version = COALESCE($7, platform_version),
             last_user_id = $8, last_seen_at = now()
           WHERE id = $1`,
          [known.id, device.status, seed?.name ?? null, ...seen]
        )
      } else {
        const inserted = await client.query<{
          code: string
          status: DeviceStatus
        }>(
          `INSERT INTO identity.devices
             (token_hash, code, user_agent, model, platform, platform_version, last_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (token_hash) DO UPDATE SET last_seen_at = now()
           RETURNING code, status`,
          [input.tokenHash, input.code, ...seen]
        )
        device = inserted.rows[0]!
      }
      await client.query("COMMIT")
      return device
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  async function review(input: {
    actorUserId: string
    deviceId: string
    name?: string | null
    status: "approved" | "revoked"
  }) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const result = await client.query<{ code: string }>(
        `UPDATE identity.devices
         SET status = $2, name = COALESCE($3, name),
           reviewed_by = $4, reviewed_at = now()
         WHERE id = $1
         RETURNING code`,
        [input.deviceId, input.status, input.name ?? null, input.actorUserId]
      )
      const device = result.rows[0]
      if (!device) throw new Error("The selected device no longer exists")
      await appendAccessAuditChanges(client, [
        {
          actorUserId: input.actorUserId,
          eventType: `device.${input.status}`,
          metadata: { code: device.code, name: input.name ?? null },
          targetId: input.deviceId,
          targetTable: "devices",
        },
      ])
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  return {
    close,

    /**
     * Records that a device was used and returns its status with the
     * enforcement switch. Ordinary session reads are a single lookup; writes
     * happen only for new, claimed, re-assigned or stale devices.
     */
    async observe(input: DeviceObservation) {
      const result = await pool.query<{
        device: KnownDevice | null
        enforced: boolean
        seeded: boolean
      }>(
        `SELECT
           (SELECT to_jsonb(known) FROM (
              SELECT id, code, status, last_seen_at, last_user_id, model, platform_version
              FROM identity.devices WHERE token_hash = $1
            ) AS known) AS device,
           (SELECT enforced FROM identity.device_approval_settings) AS enforced,
           EXISTS (
             SELECT 1 FROM identity.devices
             WHERE seed_session_id = $2::uuid AND token_hash IS NULL
           ) AS seeded`,
        [input.tokenHash, input.sessionId]
      )
      const { device, enforced, seeded } = result.rows[0]!
      const fresh =
        device &&
        !seeded &&
        device.last_user_id === input.userId &&
        (input.model === null || device.model === input.model) &&
        (input.platformVersion === null ||
          device.platform_version === input.platformVersion) &&
        Date.now() - new Date(device.last_seen_at).getTime() < refreshAfterMs
      const { code, status } = fresh ? device : await record(input)
      return { code, enforced, status }
    },

    async enforced() {
      const result = await pool.query<{ enforced: boolean }>(
        "SELECT enforced FROM identity.device_approval_settings"
      )
      return result.rows[0]?.enforced === true
    },

    async snapshot(currentTokenHash: string | null) {
      const [devices, settings] = await Promise.all([
        pool.query<{
          code: string
          first_seen_at: Date
          id: string
          last_seen_at: Date
          last_user_name: string | null
          model: string | null
          name: string | null
          platform: string | null
          platform_version: string | null
          reviewed_at: Date | null
          reviewed_by_name: string | null
          status: DeviceStatus
          token_hash: string | null
          user_agent: string | null
        }>(
          `SELECT devices.id, devices.code, devices.name, devices.status,
             devices.user_agent, devices.model, devices.platform,
             devices.platform_version,
             devices.token_hash, devices.first_seen_at, devices.last_seen_at,
             devices.reviewed_at, last_user.name AS last_user_name,
             reviewer.name AS reviewed_by_name
           FROM identity.devices
           LEFT JOIN identity.users AS last_user ON last_user.id = devices.last_user_id
           LEFT JOIN identity.users AS reviewer ON reviewer.id = devices.reviewed_by
           ORDER BY devices.status = 'pending' DESC, devices.last_seen_at DESC`
        ),
        pool.query<{ enforced: boolean }>(
          "SELECT enforced FROM identity.device_approval_settings"
        ),
      ])
      return {
        devices: devices.rows.map(
          (row): DeviceRecord => ({
            awaitingFirstVisit: row.token_hash === null,
            isCurrent: row.token_hash !== null && row.token_hash === currentTokenHash,
            code: row.code,
            firstSeenAt: row.first_seen_at,
            id: row.id,
            lastSeenAt: row.last_seen_at,
            lastUserName: row.last_user_name,
            model: row.model,
            name: row.name,
            platform: row.platform,
            platformVersion: row.platform_version,
            reviewedAt: row.reviewed_at,
            reviewedByName: row.reviewed_by_name,
            status: row.status,
            userAgent: row.user_agent,
          })
        ),
        enforced: settings.rows[0]?.enforced === true,
      }
    },

    approve(input: { actorUserId: string; deviceId: string; name: string | null }) {
      return review({ ...input, status: "approved" })
    },

    revoke(input: { actorUserId: string; deviceId: string }) {
      return review({ ...input, status: "revoked" })
    },

    async setEnforced(input: { actorUserId: string; enforced: boolean }) {
      await pool.query(
        `UPDATE identity.device_approval_settings
         SET enforced = $1, updated_by = $2, updated_at = now()`,
        [input.enforced, input.actorUserId]
      )
    },
  }
}
