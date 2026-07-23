import { randomBytes } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"

const rawArguments = process.argv.slice(2)
const seedAdminIndex = rawArguments.indexOf("--seed-admin")
const seedAdmin = seedAdminIndex >= 0
const seedAdminArguments = seedAdmin
  ? rawArguments.slice(seedAdminIndex + 1)
  : []
const launcherArguments = seedAdmin
  ? rawArguments.slice(0, seedAdminIndex)
  : rawArguments
const argumentsSet = new Set(launcherArguments)
const checkOnly = argumentsSet.has("--check")
const webOnly = argumentsSet.has("--web-only")
const workerOnce = argumentsSet.has("--worker-once")
const workerStatus = argumentsSet.has("--worker-status")
const workerOnly = workerOnce || workerStatus
function managedResourceName(value, label) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
    throw new Error(`${label} contains unsupported characters`)
  }
  return value
}

const branch = managedResourceName(
  process.env.MRM_NEON_BRANCH ?? "staging",
  "MRM_NEON_BRANCH"
)
const database = managedResourceName(
  process.env.MRM_NEON_DATABASE ?? "neondb",
  "MRM_NEON_DATABASE"
)
const upstashDatabase =
  process.env.MRM_UPSTASH_DATABASE ?? "mrmpl-staging-acceleration"

function capture(command, args) {
  const executable =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command
  const executableArguments =
    process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args

  return execFileSync(executable, executableArguments, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
}

function neonConnectionString(role, pooled = true) {
  const output = capture("neon", [
    "connection-string",
    branch,
    "--database-name",
    database,
    "--role-name",
    role,
    ...(pooled ? ["--pooled"] : []),
    "--ssl",
    "verify-full",
  ])
  const match = output.match(/postgres(?:ql)?:\/\/[^\s]+/)
  if (!match) {
    throw new Error(`Neon did not return a connection string for ${role}`)
  }
  return match[0]
}

function upstashCredentials() {
  const databases = JSON.parse(capture("upstash", ["redis", "list"]))
  const target = databases.find(
    (candidate) => candidate.database_name === upstashDatabase
  )
  if (!target) {
    throw new Error(`Upstash database ${upstashDatabase} was not found`)
  }
  if (!target.endpoint || !target.rest_token) {
    throw new Error("Upstash did not return complete REST credentials")
  }

  return {
    token: target.rest_token,
    url: target.endpoint.startsWith("http")
      ? target.endpoint
      : `https://${target.endpoint}`,
  }
}

function spawnPnpm(args, options) {
  const executable = process.env.npm_execpath
  if (!executable) {
    throw new Error("Run managed commands through a pnpm package script")
  }
  if (executable.toLowerCase().endsWith(".exe")) {
    return spawn(executable, args, options)
  }
  return spawn(process.execPath, [executable, ...args], options)
}

const webDatabaseUrl = neonConnectionString("mrmpl_staging_web")
const workerDatabaseUrl =
  webOnly || seedAdmin
    ? undefined
    : neonConnectionString("mrmpl_staging_worker")
const migrationDatabaseUrl = seedAdmin
  ? neonConnectionString("mrmpl_staging_migration", false)
  : undefined
const upstash = upstashCredentials()
const managedEnvironment = {
  ...process.env,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("base64url"),
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  MRM_MANAGED_RUNTIME: "1",
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
  UPSTASH_REDIS_REST_TOKEN: upstash.token,
  UPSTASH_REDIS_REST_URL: upstash.url,
  WEB_DATABASE_POOL_MAX: process.env.WEB_DATABASE_POOL_MAX ?? "2",
  WEB_DATABASE_URL: webDatabaseUrl,
  WORKER_DATABASE_POOL_MAX: process.env.WORKER_DATABASE_POOL_MAX ?? "2",
  ...(migrationDatabaseUrl
    ? { MIGRATION_DATABASE_URL: migrationDatabaseUrl }
    : {}),
  ...(workerDatabaseUrl ? { WORKER_DATABASE_URL: workerDatabaseUrl } : {}),
}

console.log("Managed development target resolved (credentials omitted):")
console.log(`  Neon: ${branch} / ${database}`)
console.log(`  Upstash: ${upstashDatabase}`)
if (!workerOnly && !seedAdmin) console.log("  App: http://localhost:3001")

if (checkOnly) {
  process.exit(0)
}

const children = []

if (seedAdmin) {
  children.push(
    spawnPnpm(
      ["--filter", "web", "auth:provision-admin", "--", ...seedAdminArguments],
      {
        detached: process.platform !== "win32",
        env: managedEnvironment,
        stdio: "inherit",
      }
    )
  )
} else if (!workerOnly) {
  children.push(
    spawnPnpm(["--filter", "web", "dev"], {
      detached: process.platform !== "win32",
      env: managedEnvironment,
      stdio: "inherit",
    })
  )
}

if (!webOnly && !seedAdmin) {
  const workerCommand = workerOnce
    ? "worker:once"
    : workerStatus
      ? "worker:status"
      : "worker"
  children.push(
    spawnPnpm(["--filter", "@workspace/runtime", workerCommand], {
      detached: process.platform !== "win32",
      env: managedEnvironment,
      stdio: "inherit",
    })
  )
}

let stopping = false
const exitedChildren = new Set()

function signalChild(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== "ESRCH") throw error
  }
}

function stop(signal = "SIGTERM") {
  if (stopping) return
  stopping = true
  for (const child of children) {
    signalChild(child, signal)
  }
}

process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))

const exitCode = await new Promise((resolve) => {
  for (const child of children) {
    child.once("error", (error) => {
      console.error(error.message)
      stop()
      resolve(1)
    })
    child.once("exit", (code, signal) => {
      exitedChildren.add(child)
      if (!stopping && (code !== 0 || signal)) {
        stop()
        resolve(code ?? 1)
      } else if (exitedChildren.size === children.length) {
        resolve(stopping ? 0 : (code ?? 0))
      }
    })
  }
})

process.exitCode = exitCode
