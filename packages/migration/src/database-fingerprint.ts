import { createHash } from "node:crypto"

import { Pool } from "pg"

export type TableFingerprint = {
  schema: string
  table: string
  rowCount: number
  digest: string
}

export type DatabaseFingerprint = {
  databaseDigest: string
  tableCount: number
  rowCount: number
  tables: TableFingerprint[]
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function combineTableFingerprints(tables: TableFingerprint[]) {
  const canonical = [...tables]
    .sort((left, right) =>
      `${left.schema}.${left.table}`.localeCompare(
        `${right.schema}.${right.table}`
      )
    )
    .map((table) =>
      [table.schema, table.table, table.rowCount, table.digest].join("|")
    )
    .join("\n")
  return createHash("sha256").update(canonical).digest("hex")
}

export async function fingerprintDatabase(
  connectionString: string
): Promise<DatabaseFingerprint> {
  const pool = new Pool({ connectionString })
  try {
    const discovered = await pool.query<{
      table_schema: string
      table_name: string
    }>(
      `
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('information_schema', 'pg_catalog')
          AND table_schema NOT LIKE 'pg_toast%'
        ORDER BY table_schema, table_name
      `
    )
    const tables: TableFingerprint[] = []
    for (const table of discovered.rows) {
      const qualified = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`
      const result = await pool.query<{ digest: string; row_count: string }>(
        `
          SELECT count(*)::text AS row_count,
            md5(COALESCE(string_agg(row_digest, '' ORDER BY row_digest), '')) AS digest
          FROM (
            SELECT md5(to_jsonb(source_row)::text) AS row_digest
            FROM ${qualified} AS source_row
          ) AS row_digests
        `
      )
      const row = result.rows[0]
      if (!row) throw new Error(`Could not fingerprint ${qualified}`)
      tables.push({
        schema: table.table_schema,
        table: table.table_name,
        rowCount: Number(row.row_count),
        digest: row.digest,
      })
    }
    return {
      databaseDigest: combineTableFingerprints(tables),
      tableCount: tables.length,
      rowCount: tables.reduce((total, table) => total + table.rowCount, 0),
      tables,
    }
  } finally {
    await pool.end()
  }
}
