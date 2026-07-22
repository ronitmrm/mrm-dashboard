import { fingerprintDatabase } from "../database-fingerprint"
import { readMigrationPostgresEnvironment } from "../managed-environment"

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

const { connectionString } = readMigrationPostgresEnvironment()
const expected = await fingerprintDatabase(connectionString)

const expectedRows = expected.tables
  .map(
    (table) =>
      `(${literal(table.schema)}, ${literal(table.table)}, ${table.rowCount}::bigint, ${literal(table.digest)})`
  )
  .join(",\n    ")

const actualRows = expected.tables
  .map((table) => {
    const qualified = `${identifier(table.schema)}.${identifier(table.table)}`
    return `SELECT ${literal(table.schema)}::text AS schema_name,
      ${literal(table.table)}::text AS table_name,
      count(*)::bigint AS row_count,
      md5(COALESCE(string_agg(row_digest, '' ORDER BY row_digest), '')) AS digest
    FROM (
      SELECT md5(to_jsonb(source_row)::text) AS row_digest
      FROM ${qualified} AS source_row
    ) AS row_digests`
  })
  .join("\n    UNION ALL\n    ")

process.stdout.write(`\\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
WITH expected(schema_name, table_name, row_count, digest) AS (
  VALUES
    ${expectedRows}
),
actual AS (
  ${actualRows}
),
differences AS (
  SELECT
    coalesce(expected.schema_name, actual.schema_name) AS schema_name,
    coalesce(expected.table_name, actual.table_name) AS table_name
  FROM expected
  FULL JOIN actual USING (schema_name, table_name)
  WHERE expected.row_count IS DISTINCT FROM actual.row_count
    OR expected.digest IS DISTINCT FROM actual.digest
),
actual_summary AS (
  SELECT
    count(*)::bigint AS table_count,
    sum(row_count)::bigint AS row_count,
    encode(
      digest(
        string_agg(
          schema_name || '|' || table_name || '|' || row_count::text || '|' || digest,
          E'\\n'
          ORDER BY schema_name, table_name
        ),
        'sha256'
      ),
      'hex'
    ) AS database_digest
  FROM actual
)
SELECT
  summary.table_count,
  summary.row_count,
  summary.database_digest,
  ${literal(expected.databaseDigest)} AS expected_database_digest,
  (SELECT count(*) FROM differences) AS mismatch_count,
  summary.database_digest = ${literal(expected.databaseDigest)}
    AND (SELECT count(*) FROM differences) = 0 AS exact_match
FROM actual_summary summary;
`)
