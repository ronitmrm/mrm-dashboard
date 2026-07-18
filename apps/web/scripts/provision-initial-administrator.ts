import {
  createInitialAdministratorProvisioner,
  migrateDatabase,
} from "@workspace/db"

import { createAuthSystem, readAuthEnvironment } from "../lib/auth/auth"

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

async function main() {
  const environment = readAuthEnvironment()
  const email = required("ADMIN_EMAIL").toLowerCase()
  const name = process.env.ADMIN_NAME?.trim() || "System Administrator"
  const password = required("ADMIN_PASSWORD")

  await migrateDatabase({ connectionString: environment.connectionString })

  const authSystem = createAuthSystem({
    ...environment,
    allowSignUp: true,
  })
  const provisioner = createInitialAdministratorProvisioner({
    connectionString: environment.connectionString,
  })

  try {
    const userCount = await provisioner.countUsers()
    if (userCount !== 0) {
      throw new Error(
        `Initial administrator provisioning requires zero users; found ${userCount}`
      )
    }

    const result = await authSystem.auth.api.signUpEmail({
      body: { email, name, password },
    })
    await provisioner.promote({
      email: result.user.email,
      userId: result.user.id,
    })

    const status = await provisioner.status(result.user.id)
    if (!status.systemAdministrator || status.betterAuthRole !== "admin") {
      throw new Error("Administrator provisioning did not pass verification")
    }

    console.log(`Provisioned initial administrator ${result.user.email}`)
  } finally {
    await provisioner.close()
    await authSystem.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
