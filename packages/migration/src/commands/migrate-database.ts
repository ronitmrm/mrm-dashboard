import { migrateDatabase } from "@workspace/db"

import { readMigrationPostgresEnvironment } from "../managed-environment"

const { connectionString } = readMigrationPostgresEnvironment()

await migrateDatabase({ connectionString })
process.stdout.write(`${JSON.stringify({ event: "migrations-applied" })}\n`)
