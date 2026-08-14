import { randomUUID } from "node:crypto"

import { migrateDatabase } from "@workspace/db"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createPostgresRefreshListener } from "./postgres-refresh-listener"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const pool = new Pool({ connectionString })

async function eventually(assertion: () => Promise<void> | void) {
  const deadline = Date.now() + 5_000
  let failure: unknown
  while (Date.now() < deadline) {
    try {
      await assertion()
      return
    } catch (error) {
      failure = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw failure
}

async function createOrganization(label: string) {
  const suffix = randomUUID().slice(0, 8)
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`LISTENER-${label}-${suffix}`, `Listener ${label} ${suffix}`]
  )
  return result.rows[0]!.id
}

async function enqueue(organizationId: string) {
  await pool.query(
    `
      INSERT INTO derived.refresh_jobs (
        organization_id, queue_key, idempotency_key, status, run_after
      ) VALUES ($1, 'dashboard', $2, 'pending', now())
    `,
    [organizationId, randomUUID()]
  )
}

function durableProcessor(organizationId: string) {
  let effects = 0
  let reconciliations = 0
  return {
    effects: () => effects,
    reconcile: async () => {
      reconciliations += 1
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const claim = await client.query<{ id: string }>(
          `
            SELECT id
            FROM derived.refresh_jobs
            WHERE organization_id = $1
              AND queue_key = 'dashboard'
              AND status = 'pending'
              AND run_after <= now()
            ORDER BY run_after, created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          `,
          [organizationId]
        )
        const job = claim.rows[0]
        if (job) {
          await client.query(
            `
              UPDATE derived.refresh_jobs
              SET status = 'complete', completed_at = now(), updated_at = now()
              WHERE id = $1
            `,
            [job.id]
          )
        }
        await client.query("COMMIT")
        if (job) effects += 1
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
    reconciliations: () => reconciliations,
  }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  await pool.end()
})

describe("direct PostgreSQL refresh listener", () => {
  it("runs after commit, ignores rollback, and makes duplicate hints harmless", async () => {
    const organizationId = await createOrganization("commit")
    const processor = durableProcessor(organizationId)
    const listener = createPostgresRefreshListener({
      applicationName: `mrm-listener-${randomUUID().slice(0, 8)}`,
      connectionString,
      reconcile: processor.reconcile,
    })
    await listener.start()
    const initialReconciliations = processor.reconciliations()
    try {
      const writer = await pool.connect()
      try {
        await writer.query("BEGIN")
        await writer.query(
          `
            INSERT INTO derived.refresh_jobs (
              organization_id, queue_key, idempotency_key, status, run_after
            ) VALUES ($1, 'dashboard', $2, 'pending', now())
          `,
          [organizationId, randomUUID()]
        )
        await writer.query("ROLLBACK")
      } finally {
        writer.release()
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(processor.effects()).toBe(0)
      const rolledBack = await pool.query<{ count: string }>(
        `
          SELECT count(*)::text AS count
          FROM derived.refresh_jobs
          WHERE organization_id = $1
        `,
        [organizationId]
      )
      expect(rolledBack.rows).toEqual([{ count: "0" }])

      await enqueue(organizationId)
      await eventually(() => expect(processor.effects()).toBe(1))

      const payload = JSON.stringify({
        organizationId,
        queueKey: "dashboard",
        v: 1,
      })
      await pool.query("SELECT pg_notify($1, $2), pg_notify($1, $2)", [
        "mrm_dashboard_refresh",
        payload,
      ])
      await eventually(() =>
        expect(processor.reconciliations()).toBeGreaterThan(
          initialReconciliations + 1
        )
      )
      expect(processor.effects()).toBe(1)
    } finally {
      await listener.stop()
    }
  })

  it("recovers a missed hint and durable work across worker restart", async () => {
    const organizationId = await createOrganization("restart")
    const processor = durableProcessor(organizationId)

    await enqueue(organizationId)
    const first = createPostgresRefreshListener({
      connectionString,
      reconcile: processor.reconcile,
    })
    await first.start()
    await eventually(() => expect(processor.effects()).toBe(1))
    await first.stop()

    await enqueue(organizationId)
    const restarted = createPostgresRefreshListener({
      connectionString,
      reconcile: processor.reconcile,
    })
    try {
      await restarted.start()
      await eventually(() => expect(processor.effects()).toBe(2))
    } finally {
      await restarted.stop()
    }
  })

  it("creates a fresh registered session after repeated connection loss", async () => {
    const organizationId = await createOrganization("reconnect")
    const processor = durableProcessor(organizationId)
    const applicationName = `mrm-listener-${randomUUID().slice(0, 8)}`
    const listener = createPostgresRefreshListener({
      applicationName,
      connectionString,
      initialReconnectDelayMs: 5,
      maxReconnectDelayMs: 20,
      random: () => 0.5,
      reconcile: processor.reconcile,
    })
    await listener.start()
    try {
      for (const expectedSession of [2, 3]) {
        const terminated = await pool.query<{ terminated: boolean }>(
          `
            SELECT pg_terminate_backend(pid) AS terminated
            FROM pg_stat_activity
            WHERE application_name = $1 AND pid <> pg_backend_pid()
          `,
          [applicationName]
        )
        expect(terminated.rows).toEqual([{ terminated: true }])
        await eventually(() =>
          expect(listener.snapshot()).toMatchObject({
            session: expectedSession,
            state: "ready",
          })
        )
      }

      await enqueue(organizationId)
      await eventually(() => expect(processor.effects()).toBe(1))
    } finally {
      await listener.stop()
    }

    const remaining = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_stat_activity WHERE application_name = $1`,
      [applicationName]
    )
    expect(remaining.rows).toEqual([{ count: "0" }])
  })
})
