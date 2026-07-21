import { fingerprintDatabase } from "../database-fingerprint"

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    "Usage: DATABASE_URL=<postgres-url> pnpm fingerprint:database"
  )
}

process.stdout.write(
  `${JSON.stringify(await fingerprintDatabase(connectionString), null, 2)}\n`
)
