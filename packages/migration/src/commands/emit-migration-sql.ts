import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const migrationsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../db/migrations"
)
const allNames = (await readdir(migrationsDirectory))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort((left, right) => left.localeCompare(right))

const startAfter = process.env.MIGRATION_START_AFTER
const stopAfter = process.env.MIGRATION_STOP_AFTER

for (const boundary of [startAfter, stopAfter]) {
  if (boundary && !allNames.includes(boundary)) {
    throw new Error(`Unknown migration boundary: ${boundary}`)
  }
}

const names = allNames.filter(
  (name) =>
    (!startAfter || name > startAfter) && (!stopAfter || name <= stopAfter)
)

process.stdout.write(`\\set ON_ERROR_STOP on
SELECT pg_advisory_lock(971_004_221);
CREATE SCHEMA IF NOT EXISTS migration;
CREATE TABLE IF NOT EXISTS migration.schema_migrations (
  name text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`)

for (const name of names) {
  const sql = await readFile(resolve(migrationsDirectory, name), "utf8")
  const checksum = createHash("sha256")
    .update(sql.replaceAll("\r\n", "\n"))
    .digest("hex")
  const escapedName = name.replaceAll("'", "''")
  process.stdout.write(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM migration.schema_migrations
    WHERE name = '${escapedName}' AND checksum <> '${checksum}'
  ) THEN
    RAISE EXCEPTION 'Applied migration checksum changed: ${escapedName}';
  END IF;
END
$$;
BEGIN;
${sql}
INSERT INTO migration.schema_migrations (name, checksum)
VALUES ('${escapedName}', '${checksum}')
ON CONFLICT (name) DO NOTHING;
COMMIT;
`)
}

process.stdout.write("SELECT pg_advisory_unlock(971_004_221);\n")
