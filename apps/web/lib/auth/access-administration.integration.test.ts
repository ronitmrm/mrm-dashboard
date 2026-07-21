import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createAuthorizationRepository,
  createInitialAdministratorProvisioner,
  migrateDatabase,
} from "@workspace/db"

import { createAccessAdministrationService } from "./access-administration"
import { createAuthSystem } from "./auth"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"

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
  await migrateDatabase({ connectionString })
})

beforeEach(async () => {
  await resetIdentity()
})

afterAll(async () => {
  await resetIdentity()
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
      await access.setPermissionOverride({
        actorUserId: administrator.user.id,
        effect: "deny",
        permissionKey: "planning.plan.read",
        reason: "Temporary training restriction",
        userId: staff.id,
      })
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
      await access.close()
      await provisioner.close()
      await system.close()
    }
  })
})
