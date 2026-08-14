import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { unzipSync } from "fflate"

import { normalizeArchive, normalizeArchivePath } from "./archive-safety"

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

export type PricingSchemaObject = {
  name: string
  sql: string | null
  tableName: string
  type: "index" | "table" | "trigger" | "view"
}

export type PricingFileReference = {
  column: string
  sourceRowId: number
  table: string
  value: string
}

export type PricingDatabaseInventory = {
  byteSize: number
  fileReferences: PricingFileReference[]
  foreignKeyViolations: Array<Record<string, unknown>>
  integrity: string
  schemaObjects: PricingSchemaObject[]
  sha256: string
  tables: PricingTableInventory[]
  workingTables: string[]
}

export type PricingExportManifest = {
  created_at: string
  integrity_check: string
  rows_by_table: Record<string, number>
  snapshot: string
  snapshot_sha256: string
  snapshot_size_bytes: number
  source: string
  table_count: number
  total_rows: number
}

export type PricingExportInventory = {
  byteSize: number
  database: PricingDatabaseInventory
  databaseEntry: string
  manifest: PricingExportManifest
  sha256: string
}

export type PricingExportSnapshot = {
  artifact: Uint8Array
  databaseContents: Uint8Array
  databaseEntry: string
  manifest: PricingExportManifest
  sha256: string
}

function quotedIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function isFileReferenceColumn(column: string) {
  return /(^|_)(attachment|document|drawing|file|path)(_|$)/i.test(column)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseManifest(contents: Uint8Array): PricingExportManifest {
  const manifest: unknown = JSON.parse(Buffer.from(contents).toString("utf8"))

  if (
    !isRecord(manifest) ||
    typeof manifest.created_at !== "string" ||
    typeof manifest.integrity_check !== "string" ||
    !isRecord(manifest.rows_by_table) ||
    typeof manifest.snapshot !== "string" ||
    typeof manifest.snapshot_sha256 !== "string" ||
    !Number.isSafeInteger(manifest.snapshot_size_bytes) ||
    typeof manifest.source !== "string" ||
    !Number.isSafeInteger(manifest.table_count) ||
    !Number.isSafeInteger(manifest.total_rows)
  ) {
    throw new Error("Pricing export manifest has an invalid shape")
  }

  const rowsByTable = Object.fromEntries(
    Object.entries(manifest.rows_by_table).map(([table, rowCount]) => {
      if (!Number.isSafeInteger(rowCount) || Number(rowCount) < 0) {
        throw new Error(
          `Pricing export manifest has an invalid row count for ${table}`
        )
      }
      return [table, Number(rowCount)]
    })
  )

  return {
    created_at: manifest.created_at,
    integrity_check: manifest.integrity_check,
    rows_by_table: rowsByTable,
    snapshot: manifest.snapshot,
    snapshot_sha256: manifest.snapshot_sha256,
    snapshot_size_bytes: Number(manifest.snapshot_size_bytes),
    source: manifest.source,
    table_count: Number(manifest.table_count),
    total_rows: Number(manifest.total_rows),
  }
}

function assertSafeSnapshotPath(path: string) {
  const segments = path.split("/")

  if (
    path.startsWith("/") ||
    segments.some((segment) => segment === "..") ||
    !path.endsWith(".db")
  ) {
    throw new Error(
      `Pricing export manifest has an unsafe snapshot path: ${path}`
    )
  }
}

function assertManifestMatchesDatabase(
  manifest: PricingExportManifest,
  database: PricingDatabaseInventory
) {
  const totalRows = database.tables.reduce(
    (total, table) => total + table.rowCount,
    0
  )

  if (manifest.integrity_check !== database.integrity) {
    throw new Error(
      "Pricing export integrity result does not match its manifest"
    )
  }
  if (manifest.snapshot_sha256 !== database.sha256) {
    throw new Error(
      "Pricing export snapshot checksum does not match its manifest"
    )
  }
  if (manifest.snapshot_size_bytes !== database.byteSize) {
    throw new Error("Pricing export snapshot size does not match its manifest")
  }
  if (manifest.table_count !== database.tables.length) {
    throw new Error("Pricing export table count does not match its manifest")
  }
  if (manifest.total_rows !== totalRows) {
    throw new Error(
      "Pricing export total row count does not match its manifest"
    )
  }

  const databaseRowsByTable = Object.fromEntries(
    database.tables.map((table) => [table.name, table.rowCount])
  )
  if (
    JSON.stringify(manifest.rows_by_table) !==
    JSON.stringify(databaseRowsByTable)
  ) {
    throw new Error("Pricing export table row counts do not match its manifest")
  }
}

export async function inspectPricingDatabase(
  artifactPath: string
): Promise<PricingDatabaseInventory> {
  const artifact = await readFile(artifactPath)
  const database = new DatabaseSync(artifactPath, {
    readOnly: true,
  })

  try {
    database.exec("PRAGMA query_only = ON")

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
    const schemaObjects = database
      .prepare(
        `
          SELECT
            type,
            name,
            tbl_name AS table_name,
            sql
          FROM sqlite_schema
          WHERE type IN ('index', 'table', 'trigger', 'view')
            AND name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `
      )
      .all() as Array<{
      name: string
      sql: string | null
      table_name: string
      type: PricingSchemaObject["type"]
    }>
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
    const fileReferences = tableRows.flatMap(({ name }) => {
      const columns = database
        .prepare(`PRAGMA table_info(${quotedIdentifier(name)})`)
        .all() as Array<{ name: string }>

      return columns
        .filter((column) => isFileReferenceColumn(column.name))
        .flatMap((column) => {
          const identifier = quotedIdentifier(column.name)
          const rows = database
            .prepare(
              `
                SELECT rowid AS source_row_id, ${identifier} AS value
                FROM ${quotedIdentifier(name)}
                WHERE typeof(${identifier}) = 'text'
                  AND trim(${identifier}) <> ''
                ORDER BY rowid
              `
            )
            .all() as Array<{ source_row_id: number; value: string }>

          return rows.map((row) => ({
            column: column.name,
            sourceRowId: row.source_row_id,
            table: name,
            value: row.value,
          }))
        })
    })

    return {
      byteSize: artifact.byteLength,
      fileReferences,
      foreignKeyViolations,
      integrity: integrityRows.map((row) => row.integrity_check).join("; "),
      schemaObjects: schemaObjects.map((object) => ({
        name: object.name,
        sql: object.sql,
        tableName: object.table_name,
        type: object.type,
      })),
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

export async function inspectPricingExport(
  artifactPath: string
): Promise<PricingExportInventory> {
  const snapshot = await readPricingExportSnapshot(artifactPath)
  const directory = await mkdtemp(join(tmpdir(), "mrmpl-pricing-export-"))

  try {
    const databasePath = join(directory, "pricing_app.db")
    await writeFile(databasePath, snapshot.databaseContents)
    const database = await inspectPricingDatabase(databasePath)
    assertManifestMatchesDatabase(snapshot.manifest, database)

    return {
      byteSize: snapshot.artifact.byteLength,
      database,
      databaseEntry: snapshot.databaseEntry,
      manifest: snapshot.manifest,
      sha256: snapshot.sha256,
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

export async function readPricingExportSnapshot(
  artifactPath: string
): Promise<PricingExportSnapshot> {
  const artifact = await readFile(artifactPath)
  const archive = normalizeArchive(unzipSync(artifact))
  const entries = Object.entries(archive).map(([path, contents]) => ({
    contents,
    path,
  }))
  const manifestEntries = entries.filter(
    (entry) => entry.path === "manifest.json"
  )

  if (manifestEntries.length !== 1) {
    throw new Error("Pricing export must contain exactly one manifest.json")
  }

  const manifest = parseManifest(manifestEntries[0]!.contents)
  const databaseEntry = normalizeArchivePath(manifest.snapshot)
  assertSafeSnapshotPath(databaseEntry)
  const databaseEntries = entries.filter(
    (entry) => entry.path === databaseEntry
  )

  if (databaseEntries.length !== 1) {
    throw new Error(
      `Pricing export must contain exactly one ${databaseEntry} snapshot`
    )
  }

  return {
    artifact,
    databaseContents: databaseEntries[0]!.contents,
    databaseEntry,
    manifest,
    sha256: createHash("sha256").update(artifact).digest("hex"),
  }
}
