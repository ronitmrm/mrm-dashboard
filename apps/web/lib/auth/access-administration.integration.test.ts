import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createAccessAdministrationRepository,
  createAuthorizationRepository,
  createInitialAdministratorProvisioner,
  migrateDatabase,
} from "@workspace/db"
import { Pool } from "pg"

import { createAccessAdministrationService } from "./access-administration"
import { createAuthSystem } from "./auth"
import { listGrantedCapabilities } from "./require-capability"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const originalDatabaseUrl = process.env.DATABASE_URL
const originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET
const pool = new Pool({ connectionString })

async function resetIdentity() {
  const system = createAuthSystem({
    allowSignUp: true,
    baseURL: "http://localhost:3001",
    connectionString,
    secret: "test-only-better-auth-secret-000000000000",
  })

  try {
    await system.database.execute(
      "TRUNCATE identity.sessions, identity.accounts, identity.users CASCADE"
    )
    await system.database.execute(
      "DELETE FROM identity.roles WHERE is_system = false"
    )
  } finally {
    await system.close()
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = connectionString
  process.env.BETTER_AUTH_SECRET = "test-only-better-auth-secret-000000000000"
  await migrateDatabase({ connectionString })
})

beforeEach(async () => {
  await resetIdentity()
})

afterAll(async () => {
  await resetIdentity()
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseUrl
  if (originalBetterAuthSecret === undefined)
    delete process.env.BETTER_AUTH_SECRET
  else process.env.BETTER_AUTH_SECRET = originalBetterAuthSecret
  await pool.end()
})

describe("access administration", () => {
  it("lets a capable administrator provision a sign-in-ready staff account", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const access = createAccessAdministrationService({
      auth: system.auth,
      connectionString,
    })

    try {
      const administrator = await system.auth.api.signUpEmail({
        body: {
          email: "administrator@mrmpl.test",
          name: "System Administrator",
          password: "test-only-password",
        },
      })
      await provisioner.promote({
        email: administrator.user.email,
        userId: administrator.user.id,
      })

      const staff = await access.provisionStaff({
        actorUserId: administrator.user.id,
        email: "planner@mrmpl.test",
        name: "Production Planner",
        password: "planner-test-password",
      })

      expect(staff).toMatchObject({
        email: "planner@mrmpl.test",
        name: "Production Planner",
        role: "user",
      })
      await expect(
        system.auth.api.signInEmail({
          body: {
            email: "planner@mrmpl.test",
            password: "planner-test-password",
          },
        })
      ).resolves.toMatchObject({
        user: { id: staff.id },
      })

      await expect(
        access.provisionStaff({
          actorUserId: staff.id,
          email: "unauthorized@mrmpl.test",
          name: "Unauthorized User",
          password: "unauthorized-test-password",
        })
      ).rejects.toThrow("administration.users.manage")
    } finally {
      await access.close()
      await provisioner.close()
      await system.close()
    }
  })

  it("applies role capabilities and explicit user overrides", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const access = createAccessAdministrationService({
      auth: system.auth,
      connectionString,
    })
    const otherInstanceAccess = createAccessAdministrationRepository({
      connectionString,
    })
    const authorization = createAuthorizationRepository({ connectionString })

    try {
      const administrator = await system.auth.api.signUpEmail({
        body: {
          email: "administrator@mrmpl.test",
          name: "System Administrator",
          password: "test-only-password",
        },
      })
      await provisioner.promote({
        email: administrator.user.email,
        userId: administrator.user.id,
      })
      const staff = await access.provisionStaff({
        actorUserId: administrator.user.id,
        email: "planner@mrmpl.test",
        name: "Production Planner",
        password: "planner-test-password",
      })

      await access.createRole({
        actorUserId: administrator.user.id,
        description: "Reads and manages the production plan",
        key: "production-planner",
        name: "Production planner",
        permissionKeys: ["planning.plan.read", "planning.priority.write"],
      })
      await access.assignRole({
        actorUserId: administrator.user.id,
        roleKey: "production-planner",
        userId: staff.id,
      })

      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(true)
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual(["planning.plan.read"])

      await pool.query(
        `DELETE FROM identity.user_roles
         WHERE user_id = $1
           AND role_id = (
             SELECT id FROM identity.roles WHERE key = 'production-planner'
           )`,
        [staff.id]
      )
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual([])

      await access.assignRole({
        actorUserId: administrator.user.id,
        roleKey: "production-planner",
        userId: staff.id,
      })
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual(["planning.plan.read"])

      await pool.query(
        `DELETE FROM identity.role_permissions
         WHERE role_id = (
             SELECT id FROM identity.roles WHERE key = 'production-planner'
           )
           AND permission_id = (
             SELECT id FROM identity.permissions WHERE key = 'planning.plan.read'
           )`
      )
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual([])

      await pool.query(
        `INSERT INTO identity.role_permissions (role_id, permission_id)
         SELECT roles.id, permissions.id
         FROM identity.roles AS roles
         CROSS JOIN identity.permissions AS permissions
         WHERE roles.key = 'production-planner'
           AND permissions.key = 'planning.plan.read'
         ON CONFLICT DO NOTHING`
      )
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual(["planning.plan.read"])

      await otherInstanceAccess.setPermissionOverride({
        actorUserId: administrator.user.id,
        effect: "deny",
        permissionKey: "planning.plan.read",
        reason: "Temporary training restriction",
        userId: staff.id,
      })
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual([])
      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(false)

      await access.setPermissionOverride({
        actorUserId: administrator.user.id,
        effect: "allow",
        permissionKey: "operations.dashboard.read",
        reason: "Cross-functional dashboard review",
        userId: staff.id,
      })
      await expect(
        authorization.hasCapability(staff.id, "operations.dashboard.read")
      ).resolves.toBe(true)

      const snapshot = await access.getSnapshot({
        actorUserId: administrator.user.id,
      })
      expect(snapshot.roles).toContainEqual(
        expect.objectContaining({
          key: "production-planner",
          permissionKeys: ["planning.plan.read", "planning.priority.write"],
        })
      )
      expect(snapshot.users).toContainEqual(
        expect.objectContaining({
          email: "planner@mrmpl.test",
          roleKeys: ["production-planner"],
          overrides: expect.arrayContaining([
            expect.objectContaining({
              effect: "deny",
              permissionKey: "planning.plan.read",
            }),
            expect.objectContaining({
              effect: "allow",
              permissionKey: "operations.dashboard.read",
            }),
          ]),
        })
      )
    } finally {
      await authorization.close()
      await otherInstanceAccess.close()
      await access.close()
      await provisioner.close()
      await system.close()
    }
  })
})
