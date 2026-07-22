import { validateManagedPostgresUrl } from "@workspace/db"

type Environment = Record<string, string | undefined>

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("WORKER_DATABASE_POOL_MAX must be a positive integer")
  }
  return parsed
}

export function readWorkerPostgresEnvironment(
  environment: Environment = process.env
) {
  const hosted = environment.MRM_MANAGED_RUNTIME === "1"
  const connectionString = hosted
    ? environment.WORKER_DATABASE_URL
    : (environment.WORKER_DATABASE_URL ??
      environment.DATABASE_URL ??
      "postgres://mrmpl:mrmpl@localhost:5434/mrmpl")

  if (!connectionString) {
    throw new Error("WORKER_DATABASE_URL is required in managed runtime mode")
  }
  if (hosted) {
    validateManagedPostgresUrl(connectionString, {
      responsibility: "worker",
    })
  }

  return {
    connectionString,
    hosted,
    max: positiveInteger(environment.WORKER_DATABASE_POOL_MAX, 2),
  }
}
