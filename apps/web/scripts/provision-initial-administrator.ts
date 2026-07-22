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

type ProvisionArguments = {
  email?: string
  help: boolean
  name?: string
  passwordFromStdin: boolean
}

function parseArguments(argv: string[]): ProvisionArguments {
  const result: ProvisionArguments = {
    help: false,
    passwordFromStdin: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--") {
      continue
    }
    if (argument === "--help" || argument === "-h") {
      result.help = true
      continue
    }
    if (argument === "--password-stdin") {
      result.passwordFromStdin = true
      continue
    }
    if (argument === "--email" || argument === "--name") {
      const value = argv[index + 1]?.trim()
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`)
      }
      if (argument === "--email") result.email = value
      else result.name = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return result
}

async function readPasswordFromStdin() {
  let password = ""
  for await (const chunk of process.stdin) {
    password += chunk.toString()
  }
  password = password.replace(/\r?\n$/, "")
  if (!password.trim()) {
    throw new Error("Password from stdin cannot be empty")
  }
  return password
}

async function promptForPassword() {
  const input = process.stdin
  if (!input.isTTY) {
    throw new Error(
      "ADMIN_PASSWORD is required when stdin is not a terminal; alternatively pass --password-stdin"
    )
  }

  return new Promise<string>((resolve, reject) => {
    let password = ""
    const wasRaw = input.isRaw

    const cleanup = () => {
      input.off("data", onData)
      input.setRawMode(wasRaw)
      input.pause()
    }
    const finish = () => {
      cleanup()
      process.stdout.write("\n")
      if (!password.trim()) {
        reject(new Error("Password cannot be empty"))
        return
      }
      resolve(password)
    }
    const cancel = () => {
      cleanup()
      process.stdout.write("\n")
      reject(new Error("Administrator provisioning cancelled"))
    }
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          cancel()
          return
        }
        if (
          character === "\r" ||
          character === "\n" ||
          character === "\u0004"
        ) {
          finish()
          return
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1)
          continue
        }
        if (character >= " ") password += character
      }
    }

    process.stdout.write("Admin password: ")
    input.setRawMode(true)
    input.resume()
    input.on("data", onData)
  })
}

function printHelp() {
  console.log(`Seed the first system administrator.

Usage:
  pnpm auth:seed-admin -- --email <address> [--name <display-name>]
  printf '%s' "$PASSWORD" | pnpm auth:seed-admin -- --email <address> --password-stdin

The database must contain zero users. ADMIN_EMAIL, ADMIN_NAME, and
ADMIN_PASSWORD remain available for non-interactive compatibility.`)
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2))
  if (arguments_.help) {
    printHelp()
    return
  }

  const environment = readAuthEnvironment()
  const email = (arguments_.email ?? required("ADMIN_EMAIL")).toLowerCase()
  const name =
    arguments_.name ?? process.env.ADMIN_NAME?.trim() ?? "System Administrator"
  const password = arguments_.passwordFromStdin
    ? await readPasswordFromStdin()
    : (process.env.ADMIN_PASSWORD?.trim() ?? (await promptForPassword()))
  const migrationConnectionString =
    process.env.MIGRATION_DATABASE_URL?.trim() || environment.connectionString

  await migrateDatabase({ connectionString: migrationConnectionString })

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
