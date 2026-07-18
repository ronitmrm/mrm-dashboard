import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

import Database from "better-sqlite3"

const EXCLUDED_IDENTITY_TABLES = new Set([
  "app_sessions",
  "app_user_permissions",
  "app_users",
])

type PricingTableInventory = {
  disposition: "canonical" | "excluded_identity"
  name: string
  rowCount: number
}

export type PricingDatabaseInventory = {
  byteSize: number
  foreignKeyViolations: Array<Record<string, unknown>>
  integrity: string
  sha256: string
  tables: PricingTableInventory[]
  workingTables: string[]
}

function quotedIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

export async function inspectPricingDatabase(
  artifactPath: string
): Promise<PricingDatabaseInventory> {
  const artifact = await readFile(artifactPath)
  const database = new Database(artifactPath, {
    fileMustExist: true,
    readonly: true,
  })

  try {
    database.pragma("query_only = ON")

    const integrityRows = database
      .prepare("PRAGMA integrity_check")
      .all() as Array<{ integrity_check: string }>
    const foreignKeyViolations = database
      .prepare("PRAGMA foreign_key_check")
      .all() as Array<Record<string, unknown>>
    const tableRows = database
      .prepare(
        `
          SELECT name
          FROM sqlite_schema
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `
      )
      .all() as Array<{ name: string }>
    const tables = tableRows.map(({ name }) => {
      const row = database
        .prepare(`SELECT count(*) AS row_count FROM ${quotedIdentifier(name)}`)
        .get() as { row_count: number }

      return {
        disposition: EXCLUDED_IDENTITY_TABLES.has(name)
          ? ("excluded_identity" as const)
          : ("canonical" as const),
        name,
        rowCount: row.row_count,
      }
    })

    return {
      byteSize: artifact.byteLength,
      foreignKeyViolations,
      integrity: integrityRows.map((row) => row.integrity_check).join("; "),
      sha256: createHash("sha256").update(artifact).digest("hex"),
      tables,
      workingTables: tables
        .filter((table) => table.disposition === "canonical")
        .map((table) => table.name),
    }
  } finally {
    database.close()
  }
}
