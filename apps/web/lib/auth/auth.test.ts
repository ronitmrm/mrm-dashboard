import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createAuthorizationRepository,
  createInitialAdministratorProvisioner,
  migrateDatabase,
} from "@workspace/db"

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
  } finally {
    await system.close()
  }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  await resetIdentity()
})

afterAll(async () => {
  await resetIdentity()
})

describe("PostgreSQL Better Auth", () => {
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
