import { attachDatabasePool } from "@vercel/functions"
import {
  sharedManagedPostgresPool,
  validateManagedPostgresUrl,
} from "@workspace/db"
import type { Pool } from "pg"

type Environment = Record<string, string | undefined>

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("WEB_DATABASE_POOL_MAX must be a positive integer")
  }
  return parsed
}

export function readWebPostgresEnvironment(
  environment: Environment = process.env
) {
  const hosted =
    environment.MRM_MANAGED_RUNTIME === "1" || environment.VERCEL === "1"
  const connectionString = hosted
    ? environment.WEB_DATABASE_URL
    : (environment.WEB_DATABASE_URL ?? environment.DATABASE_URL)

  if (!connectionString) {
    throw new Error(
      hosted
        ? "WEB_DATABASE_URL is required in managed runtime mode"
        : "DATABASE_URL is required for local PostgreSQL"
    )
  }
  if (hosted) {
    validateManagedPostgresUrl(connectionString, { responsibility: "web" })
  }

  return {
    connectionString,
    hosted,
    max: positiveInteger(environment.WEB_DATABASE_POOL_MAX, 2),
  }
}

let attachedPool: Pool | undefined

export function getWebPostgresPool(environment: Environment = process.env) {
  const config = readWebPostgresEnvironment(environment)
  const pool = sharedManagedPostgresPool({
    applicationName: "mrm-web",
    connectionString: config.connectionString,
    max: config.max,
  })

  if (config.hosted && pool !== attachedPool) {
    attachDatabasePool(pool)
    attachedPool = pool
  }

  return pool
}
