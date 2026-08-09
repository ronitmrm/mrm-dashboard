import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Pool } from "pg"

const MIGRATION_LOCK_ID = 7_180_202_607
const migrationsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations"
)

type MigrateDatabaseOptions = {
  connectionString: string
  through?: string
}

type AppliedMigration = {
  checksum: string
  name: string
}

function checksum(contents: string) {
  return createHash("sha256")
    .update(contents.replaceAll("\r\n", "\n"))
    .digest("hex")
}

async function migrationFiles() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right))
}

export async function migrateDatabase({
  connectionString,
  through,
}: MigrateDatabaseOptions) {
  const pool = new Pool({ connectionString, max: 1 })
  const client = await pool.connect()

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID])
    await client.query("CREATE SCHEMA IF NOT EXISTS migration")
    await client.query(`
      CREATE TABLE IF NOT EXISTS migration.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const appliedResult = await client.query<AppliedMigration>(
      "SELECT name, checksum FROM migration.schema_migrations"
    )
    const applied = new Map(
      appliedResult.rows.map((row) => [row.name, row.checksum])
    )

    const names = await migrationFiles()
    const throughIndex = through ? names.indexOf(through) : names.length - 1
    if (throughIndex < 0) {
      throw new Error(`Unknown migration boundary: ${through}`)
    }

    for (const name of names.slice(0, throughIndex + 1)) {
      const sql = await readFile(resolve(migrationsDirectory, name), "utf8")
      const expectedChecksum = checksum(sql)
      const recordedChecksum = applied.get(name)

      if (recordedChecksum && recordedChecksum !== expectedChecksum) {
        throw new Error(`Applied migration checksum changed: ${name}`)
      }

      if (recordedChecksum) {
        continue
      }

      await client.query("BEGIN")
      try {
        await client.query(sql)
        await client.query(
          `
            INSERT INTO migration.schema_migrations (name, checksum)
            VALUES ($1, $2)
          `,
          [name, expectedChecksum]
        )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
    client.release()
    await pool.end()
  }
}
