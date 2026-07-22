import { Pool } from "pg"

import { readMigrationPostgresEnvironment } from "../managed-environment"

type ForeignKey = {
  constraint_name: string
  definition: string
  schema_name: string
  table_name: string
  validated: boolean
}

type Table = {
  schema_name: string
  table_name: string
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function relation(row: Table) {
  return `${identifier(row.schema_name)}.${identifier(row.table_name)}`
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

const mode = process.argv.find(
  (argument) => argument === "suspend" || argument === "resume"
)
const truncateTarget = process.argv.includes("--truncate-target")
if (mode !== "suspend" && mode !== "resume") {
  throw new Error("Usage: emit-transfer-constraints-sql.ts suspend|resume")
}

const { connectionString } = readMigrationPostgresEnvironment()
const pool = new Pool({ connectionString, max: 1 })

try {
  const foreignKeys = await pool.query<ForeignKey>(`
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      foreign_key.conname AS constraint_name,
      pg_get_constraintdef(foreign_key.oid, true) AS definition,
      foreign_key.convalidated AS validated
    FROM pg_constraint foreign_key
    JOIN pg_class relation ON relation.oid = foreign_key.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE foreign_key.contype = 'f'
      AND namespace.nspname NOT IN ('information_schema', 'pg_catalog')
      AND namespace.nspname NOT LIKE 'pg_toast%'
    ORDER BY namespace.nspname, relation.relname, foreign_key.conname
  `)
  const tables = await pool.query<Table>(`
    SELECT schemaname AS schema_name, tablename AS table_name
    FROM pg_tables
    WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
      AND schemaname NOT LIKE 'pg_toast%'
    ORDER BY schemaname, tablename
  `)

  const statements: string[] = []

  if (mode === "suspend") {
    for (const row of foreignKeys.rows) {
      statements.push(
        `ALTER TABLE ${relation(row)} DROP CONSTRAINT IF EXISTS ${identifier(row.constraint_name)}`
      )
    }
    for (const row of tables.rows) {
      statements.push(`ALTER TABLE ${relation(row)} DISABLE TRIGGER USER`)
    }
    if (truncateTarget) {
      statements.push(
        `TRUNCATE TABLE ${tables.rows.map((row) => relation(row)).join(", ")} RESTART IDENTITY`
      )
    }
  } else {
    for (const row of tables.rows) {
      statements.push(`ALTER TABLE ${relation(row)} ENABLE TRIGGER USER`)
    }
    for (const row of foreignKeys.rows) {
      const notValid = /\bNOT VALID\b/i.test(row.definition)
        ? row.definition
        : `${row.definition} NOT VALID`
      statements.push(
        `ALTER TABLE ${relation(row)} ADD CONSTRAINT ${identifier(row.constraint_name)} ${notValid}`
      )
    }
    for (const row of foreignKeys.rows.filter((item) => item.validated)) {
      statements.push(
        `ALTER TABLE ${relation(row)} VALIDATE CONSTRAINT ${identifier(row.constraint_name)}`
      )
    }
  }

  process.stdout.write("\\set ON_ERROR_STOP on\nDO $transfer$\nBEGIN\n")
  for (const statement of statements) {
    process.stdout.write(`  EXECUTE ${literal(statement)};\n`)
  }
  process.stdout.write("END\n$transfer$;\n")
} finally {
  await pool.end()
}
