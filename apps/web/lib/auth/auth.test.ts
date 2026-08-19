import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { Client, Pool } from "pg"

import {
  createAuthorizationRepository,
  createInitialAdministratorProvisioner,
  migrateDatabase,
} from "@workspace/db"

import { createAuthSystem } from "./auth"
import { createPasswordResetService } from "./password-reset"

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const testDatabaseName = `mrmpl_auth_${randomUUID().replaceAll("-", "")}`
const connectionUrl = new URL(baseConnectionString)
connectionUrl.pathname = `/${testDatabaseName}`
const connectionString = connectionUrl.toString()

const maintenanceUrl = new URL(baseConnectionString)
maintenanceUrl.pathname = "/postgres"

const pool = new Pool({ connectionString })

async function withMaintenanceClient(
  operation: (client: Client) => Promise<void>
) {
  const client = new Client({ connectionString: maintenanceUrl.toString() })
  await client.connect()
  try {
    await operation(client)
  } finally {
    await client.end()
  }
}

async function resetIdentity() {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await client.query("DELETE FROM audit.events WHERE event_type LIKE 'access.%'")
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
  await withMaintenanceClient(async (client) => {
    await client.query(`CREATE DATABASE "${testDatabaseName}"`)
  })
  await migrateDatabase({ connectionString })
})

beforeEach(resetIdentity)

afterAll(async () => {
  await resetIdentity()
  await pool.end()
  await withMaintenanceClient(async (client) => {
    await client.query(`DROP DATABASE "${testDatabaseName}" WITH (FORCE)`)
  })
})

describe("PostgreSQL Better Auth", () => {
  it("keeps session authorization in PostgreSQL with cookie caching disabled", async () => {
    const system = createAuthSystem({
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })

    try {
      const options = system.auth.options as {
        secondaryStorage?: unknown
        session?: { cookieCache?: { enabled?: boolean } }
      }
      expect(options.session?.cookieCache).toEqual({ enabled: false })
      expect(options.secondaryStorage).toBeUndefined()
    } finally {
      await system.close()
    }
  })

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

  it("lets a user change only their own password", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const reset = createPasswordResetService({ auth: system.auth })

    try {
      const user = await system.auth.api.signUpEmail({
        body: {
          email: "self-password@mrmpl.test",
          name: "Self Password",
          password: "current-self-password",
        },
      })
      const otherUser = await system.auth.api.signUpEmail({
        body: {
          email: "other-password@mrmpl.test",
          name: "Other Password",
          password: "current-other-password",
        },
      })
      const signIn = await system.auth.api.signInEmail({
        body: {
          email: user.user.email,
          password: "current-self-password",
        },
        returnHeaders: true,
      })
      const headers = new Headers({
        cookie: signIn.headers
          .getSetCookie()
          .map((value) => value.split(";", 1)[0])
          .join("; "),
      })

      await expect(reset.getScreenContext(headers)).resolves.toMatchObject({
        isAdministrator: false,
        users: [{ id: user.user.id }],
      })

      await expect(
        reset.resetPassword({
          currentPassword: "current-self-password",
          headers,
          newPassword: "changed-other-password",
          targetUserId: otherUser.user.id,
        })
      ).rejects.toThrow("only change your own password")

      await reset.resetPassword({
        currentPassword: "current-self-password",
        headers,
        newPassword: "changed-self-password",
        targetUserId: user.user.id,
      })

      await expect(
        system.auth.api.signInEmail({
          body: {
            email: user.user.email,
            password: "current-self-password",
          },
        })
      ).rejects.toThrow()
      await expect(
        system.auth.api.signInEmail({
          body: {
            email: user.user.email,
            password: "changed-self-password",
          },
        })
      ).resolves.toMatchObject({ user: { id: user.user.id } })
    } finally {
      await system.close()
    }
  })

  it("lets an administrator reset any user's password and revoke their sessions", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const reset = createPasswordResetService({ auth: system.auth })

    try {
      const administrator = await system.auth.api.signUpEmail({
        body: {
          email: "password-admin@mrmpl.test",
          name: "Password Administrator",
          password: "password-admin-current",
        },
      })
      await provisioner.promote({
        email: administrator.user.email,
        userId: administrator.user.id,
      })
      const staff = await system.auth.api.signUpEmail({
        body: {
          email: "password-staff@mrmpl.test",
          name: "Password Staff",
          password: "password-staff-current",
        },
      })
      const administratorSignIn = await system.auth.api.signInEmail({
        body: {
          email: administrator.user.email,
          password: "password-admin-current",
        },
        returnHeaders: true,
      })
      const staffSignIn = await system.auth.api.signInEmail({
        body: {
          email: staff.user.email,
          password: "password-staff-current",
        },
        returnHeaders: true,
      })
      const cookie = (responseHeaders: Headers) =>
        responseHeaders
          .getSetCookie()
          .map((value) => value.split(";", 1)[0])
          .join("; ")

      await expect(
        reset.getScreenContext(
          new Headers({ cookie: cookie(administratorSignIn.headers) })
        )
      ).resolves.toMatchObject({
        isAdministrator: true,
        users: expect.arrayContaining([
          { id: administrator.user.id },
          { id: staff.user.id },
        ]),
      })

      await reset.resetPassword({
        headers: new Headers({ cookie: cookie(administratorSignIn.headers) }),
        newPassword: "password-staff-reset",
        targetUserId: staff.user.id,
      })

      await expect(
        system.auth.api.signInEmail({
          body: {
            email: staff.user.email,
            password: "password-staff-current",
          },
        })
      ).rejects.toThrow()
      await expect(
        system.auth.api.signInEmail({
          body: {
            email: staff.user.email,
            password: "password-staff-reset",
          },
        })
      ).resolves.toMatchObject({ user: { id: staff.user.id } })
      await expect(
        system.auth.api.getSession({
          headers: new Headers({ cookie: cookie(staffSignIn.headers) }),
        })
      ).resolves.toBeNull()
    } finally {
      await provisioner.close()
      await system.close()
    }
  })

  it("rejects a revoked session on the next request across instances and Redis loss", async () => {
    const firstInstance = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const secondInstance = createAuthSystem({
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const email = `revocation-${randomUUID()}@mrmpl.test`
    const password = "revocation-test-password"

    try {
      await firstInstance.auth.api.signUpEmail({
        body: { email, name: "Revocation Test", password },
      })
      const signedIn = await firstInstance.auth.api.signInEmail({
        body: { email, password },
        returnHeaders: true,
      })
      const cookieHeader = signedIn.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";", 1)[0])
        .join("; ")

      for (const instance of [firstInstance, secondInstance]) {
        await expect(
          instance.auth.api.getSession({
            headers: new Headers({ cookie: cookieHeader }),
          })
        ).resolves.toMatchObject({
          session: { token: signedIn.response.token },
          user: { email },
        })
      }

      const deleted = await pool.query(
        "DELETE FROM identity.sessions WHERE token = $1",
        [signedIn.response.token]
      )
      expect(deleted.rowCount).toBe(1)

      for (const instance of [firstInstance, secondInstance]) {
        await expect(
          instance.auth.api.getSession({
            headers: new Headers({ cookie: cookieHeader }),
          })
        ).resolves.toBeNull()
      }
    } finally {
      await secondInstance.close()
      await firstInstance.close()
    }
  })

  it("rejects a banned user's session on another instance", async () => {
    const firstInstance = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const secondInstance = createAuthSystem({
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const suffix = randomUUID()
    const administratorEmail = `ban-admin-${suffix}@mrmpl.test`
    const staffEmail = `ban-staff-${suffix}@mrmpl.test`

    try {
      const administrator = await firstInstance.auth.api.signUpEmail({
        body: {
          email: administratorEmail,
          name: "Ban Administrator",
          password: "ban-administrator-password",
        },
      })
      await provisioner.promote({
        email: administrator.user.email,
        userId: administrator.user.id,
      })
      const staff = await firstInstance.auth.api.signUpEmail({
        body: {
          email: staffEmail,
          name: "Banned Staff",
          password: "banned-staff-password",
        },
      })
      const administratorSignIn = await firstInstance.auth.api.signInEmail({
        body: {
          email: administratorEmail,
          password: "ban-administrator-password",
        },
        returnHeaders: true,
      })
      const staffSignIn = await firstInstance.auth.api.signInEmail({
        body: { email: staffEmail, password: "banned-staff-password" },
        returnHeaders: true,
      })
      const cookie = (headers: Headers) =>
        headers
          .getSetCookie()
          .map((value) => value.split(";", 1)[0])
          .join("; ")

      await firstInstance.auth.api.banUser({
        body: {
          banReason: "Authorization freshness test",
          userId: staff.user.id,
        },
        headers: new Headers({
          cookie: cookie(administratorSignIn.headers),
        }),
      })

      await expect(
        pool.query<{
          actor_user_id: string | null
          after_state: { banned: boolean }
          source_table: string
        }>(
          `SELECT actor_user_id, after_state, source_table
           FROM audit.events
           WHERE event_type = 'access.user.status_changed'
             AND target_id = $1
           ORDER BY occurred_at DESC
           LIMIT 1`,
          [staff.user.id]
        )
      ).resolves.toMatchObject({
        rows: [
          {
            actor_user_id: null,
            after_state: { banned: true },
            source_table: "identity_user_trigger",
          },
        ],
      })

      await expect(
        secondInstance.auth.api.getSession({
          headers: new Headers({ cookie: cookie(staffSignIn.headers) }),
        })
      ).resolves.toBeNull()
    } finally {
      await provisioner.close()
      await secondInstance.close()
      await firstInstance.close()
    }
  })

  it("atomically records privileged identity changes made outside Better Auth", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })

    try {
      const user = await system.auth.api.signUpEmail({
        body: {
          email: `trigger-audit-${randomUUID()}@mrmpl.test`,
          name: "Trigger Audit",
          password: "trigger-audit-password",
        },
      })

      await pool.query("UPDATE identity.users SET role = 'admin' WHERE id = $1", [
        user.user.id,
      ])

      await expect(
        pool.query<{
          actor_user_id: string | null
          after_state: { role: string }
          source_table: string
        }>(
          `SELECT actor_user_id, after_state, source_table
           FROM audit.events
           WHERE event_type = 'access.user.role_changed'
             AND target_id = $1
           ORDER BY occurred_at DESC
           LIMIT 1`,
          [user.user.id]
        )
      ).resolves.toMatchObject({
        rows: [
          {
            actor_user_id: null,
            after_state: { role: "admin" },
            source_table: "identity_user_trigger",
          },
        ],
      })
    } finally {
      await system.close()
    }
  })
})
