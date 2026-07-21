import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"

import {
  createAuthorizationRepository,
  createInitialAdministratorProvisioner,
  migrateDatabase,
} from "@workspace/db"

import { createAuthRateLimitStorage, createAuthSystem } from "./auth"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"

const pool = new Pool({ connectionString })

async function resetIdentity() {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await client.query("DELETE FROM identity.sessions")
    await client.query("DELETE FROM identity.accounts")
    await client.query("DELETE FROM identity.users")
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  await resetIdentity()
})

afterAll(async () => {
  await resetIdentity()
  await pool.end()
})

describe("PostgreSQL Better Auth", () => {
  it("resets identity rows without deleting business data", async () => {
    const organizationId = randomUUID()
    const organizationCode = `AUTH-${organizationId.slice(0, 8)}`

    await pool.query(
      `INSERT INTO core.organizations (id, code, name)
       VALUES ($1::uuid, $2, $3)`,
      [organizationId, organizationCode, "Auth reset sentinel"]
    )

    try {
      await resetIdentity()

      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM core.organizations
         WHERE id = $1::uuid`,
        [organizationId]
      )

      expect(result.rows[0]?.count).toBe("1")
    } finally {
      await pool.query("DELETE FROM core.organizations WHERE id = $1::uuid", [
        organizationId,
      ])
    }
  })

  it("uses a fail-open Redis accelerator through Better Auth's atomic limiter", async () => {
    const calls: Array<Record<string, unknown>> = []
    const storage = createAuthRateLimitStorage(
      "redis://localhost:6380",
      async (input) => {
        calls.push(input)
        return {
          allowed: false,
          count: 4,
          retryAfterSeconds: 7,
          source: "redis" as const,
        }
      }
    )

    await expect(
      storage.consume("sign-in:127.0.0.1", { max: 3, window: 10 })
    ).resolves.toEqual({ allowed: false, retryAfter: 7 })
    expect(calls).toEqual([
      expect.objectContaining({
        key: expect.stringMatching(/^mrm:auth:rate:[a-f0-9]{64}$/),
        limit: 3,
        redisUrl: "redis://localhost:6380",
        windowSeconds: 10,
      }),
    ])
  })

  it("provisions a fresh user and authenticates the new credential", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const authorization = createAuthorizationRepository({ connectionString })

    try {
      await expect(provisioner.countUsers()).resolves.toBe(0)

      const provisioned = await system.auth.api.signUpEmail({
        body: {
          email: "administrator@mrmpl.test",
          name: "System Administrator",
          password: "test-only-password",
        },
      })
      await provisioner.promote({
        email: provisioned.user.email,
        userId: provisioned.user.id,
      })
      await expect(
        provisioner.promote({
          email: provisioned.user.email,
          userId: provisioned.user.id,
        })
      ).rejects.toThrow()

      expect(provisioned.user).toMatchObject({
        email: "administrator@mrmpl.test",
        name: "System Administrator",
      })

      const signedIn = await system.auth.api.signInEmail({
        body: {
          email: "administrator@mrmpl.test",
          password: "test-only-password",
        },
      })

      expect(signedIn.user.id).toBe(provisioned.user.id)
      expect(signedIn.token).toBeTruthy()
      await expect(provisioner.status(provisioned.user.id)).resolves.toEqual({
        betterAuthRole: "admin",
        systemAdministrator: true,
      })
      await expect(
        authorization.hasCapability(provisioned.user.id, "pricing.masters.read")
      ).resolves.toBe(true)
      await expect(
        authorization.hasCapability(
          provisioned.user.id,
          "pricing.not-a-capability"
        )
      ).resolves.toBe(false)
    } finally {
      await authorization.close()
      await provisioner.close()
      await system.close()
    }
  })
})
