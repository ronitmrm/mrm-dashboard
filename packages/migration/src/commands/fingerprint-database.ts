import { fingerprintDatabase } from "../database-fingerprint"
import { readMigrationPostgresEnvironment } from "../managed-environment"

const { connectionString } = readMigrationPostgresEnvironment()
if (!connectionString) {
  throw new Error(
    "Usage: DATABASE_URL=<postgres-url> pnpm fingerprint:database"
  )
}

process.stdout.write(
  `${JSON.stringify(await fingerprintDatabase(connectionString), null, 2)}\n`
)
