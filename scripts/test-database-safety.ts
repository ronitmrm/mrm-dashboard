import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const applicationDatabaseKeys = [
  "DATABASE_URL",
  "WEB_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "WORKER_LISTENER_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "REPORTING_DATABASE_URL",
]

function endpoint(url: URL) {
  return url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")
}

function databaseUrl(value: string) {
  try {
    const url = new URL(value)
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error()
    return url
  } catch {
    // Never include a connection string or the URL parser's cause in errors.
    throw new Error(
      "Unsafe test database: invalid PostgreSQL connection setting"
    )
  }
}

export function assertSafeTestDatabase() {
  const url = databaseUrl(
    process.env.TEST_DATABASE_URL ??
      "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
  )
  if (!/^\/mrmpl_test(?:_[a-z0-9_]+)?$/.test(url.pathname)) {
    throw new Error("Unsafe test database: use a dedicated mrmpl_test database")
  }
  if (
    [...url.searchParams.keys()].some(
      (key) => !["sslmode", "channel_binding"].includes(key)
    )
  ) {
    throw new Error(
      "Unsafe test database: connection routing overrides are not allowed"
    )
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (local) return

  if (url.hostname !== process.env.TEST_DATABASE_ALLOWED_HOST) {
    throw new Error(
      "Unsafe test database: explicitly allow the isolated TEST_DATABASE_ALLOWED_HOST"
    )
  }

  const environments: Record<string, string | undefined>[] = [process.env]
  for (const directory of [workspace, resolve(workspace, "apps/web")]) {
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
      ".env.development",
      ".env.development.local",
    ]) {
      const path = resolve(directory, name)
      if (existsSync(path))
        environments.push(parseEnv(readFileSync(path, "utf8")))
    }
  }
  for (const environment of environments) {
    for (const key of applicationDatabaseKeys) {
      const value = environment[key]
      if (value && endpoint(databaseUrl(value)) === endpoint(url)) {
        throw new Error(
          "Unsafe test database: application/live endpoints are forbidden"
        )
      }
    }
  }
}
