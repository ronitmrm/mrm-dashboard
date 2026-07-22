import { validateManagedPostgresUrl } from "@workspace/db"

type Environment = Record<string, string | undefined>

export function readMigrationPostgresEnvironment(
  environment: Environment = process.env
) {
  const hosted = environment.MRM_MANAGED_RUNTIME === "1"
  const connectionString = hosted
    ? environment.MIGRATION_DATABASE_URL
    : (environment.MIGRATION_DATABASE_URL ??
      environment.DATABASE_URL ??
      "postgres://mrmpl:mrmpl@localhost:5434/mrmpl")

  if (!connectionString) {
    throw new Error(
      hosted
        ? "MIGRATION_DATABASE_URL is required in managed runtime mode"
        : "DATABASE_URL is required for local migration commands"
    )
  }
  if (hosted) {
    validateManagedPostgresUrl(connectionString, {
      direct: true,
      responsibility: "migration",
    })
  }

  return { connectionString, hosted }
}
