import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import Database from "better-sqlite3"
import { Pool, type PoolClient } from "pg"

import {
  inspectPricingExport,
  readPricingExportSnapshot,
} from "../pricing-database"

const STAGING_COLUMNS = {
  counters: ["name", "value"],
  customers: [
    "id",
    "customer_uid",
    "company_name",
    "status",
    "contact_name",
    "email",
    "phone",
    "country",
    "notes",
    "created_at",
  ],
  design_categories: ["id", "name", "created_at", "code"],
  design_processes: ["id", "name", "created_at"],
  design_subcategories: [
    "id",
    "category_id",
    "name",
    "created_at",
    "combination_code",
  ],
  enquiry_import_review_rows: [
    "id",
    "review_id",
    "row_no",
    "part",
    "description",
    "grade",
    "quantity",
    "target_price",
    "drawing_reference",
    "remarks",
    "classification",
    "suggested_action",
    "matched_quote_item_id",
    "matched_product_id",
    "match_note",
    "created_enquiry_item_id",
    "applied_action",
    "matched_enquiry_item_id",
  ],
  enquiry_import_reviews: [
    "id",
    "enquiry_id",
    "status",
    "created_at",
    "applied_at",
  ],
  product_grades: ["id", "name", "created_at"],
  product_machine_types: ["id", "name", "created_at"],
  product_rod_types: ["id", "name", "created_at"],
  quote_commercial_terms: ["id", "term_type", "name", "created_at"],
  quote_material_rates: [
    "id",
    "grade",
    "rod_type",
    "alloy_premium",
    "ext_cost",
    "created_at",
  ],
  quote_packaging_options: [
    "id",
    "name",
    "packing_cost",
    "cost_basis",
    "created_at",
  ],
  quote_shipping_terms: ["id", "name", "shipping_cost", "created_at"],
  website_applications: ["id", "name", "sort_order", "created_at"],
  website_certifications: ["id", "name", "sort_order", "created_at"],
  website_field_options: [
    "id",
    "field_type",
    "name",
    "sort_order",
    "created_at",
  ],
} as const

type SupportedTable = keyof typeof STAGING_COLUMNS

type StagePricingExportOptions = {
  artifactPath: string
  connectionString: string
  migrationRunId: string
}

export type PricingStagingResult = {
  artifactId: string
  migrationRunId: string
  relationshipConflicts: number
  stagedRowsByTable: Record<string, number>
}

function quotedIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function sourceId(row: Record<string, unknown>) {
  return String(row.id ?? row.__source_rowid)
}

function sourceRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([column]) => column !== "__source_rowid")
  )
}

async function upsertRows(
  client: PoolClient,
  options: {
    artifactId: string
    columns: readonly string[]
    migrationRunId: string
    rows: Array<Record<string, unknown>>
    table: SupportedTable
  }
) {
  const targetTable = `sqlite_${options.table}`
  const insertColumns = [
    "migration_run_id",
    "artifact_id",
    "source_id",
    ...options.columns,
    "source_row",
  ]
  const assignments = [...options.columns, "source_row", "staged_at"]
    .map((column) =>
      column === "staged_at"
        ? `${quotedIdentifier(column)} = now()`
        : `${quotedIdentifier(column)} = EXCLUDED.${quotedIdentifier(column)}`
    )
    .join(", ")

  for (const row of options.rows) {
    const values = [
      options.migrationRunId,
      options.artifactId,
      sourceId(row),
      ...options.columns.map((column) => row[column] ?? null),
      JSON.stringify(sourceRow(row)),
    ]
    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ")

    await client.query(
      `
        INSERT INTO migration.${quotedIdentifier(targetTable)} (
          ${insertColumns.map(quotedIdentifier).join(", ")}
        )
        VALUES (${placeholders})
        ON CONFLICT (artifact_id, source_id)
        DO UPDATE SET ${assignments}
      `,
      values
    )
  }
}

function foreignKeyConflict(
  violation: Record<string, unknown>,
  database: Database.Database
) {
  const table = String(violation.table)
  const rowId = Number(violation.rowid)
  const row = database
    .prepare(
      `SELECT rowid AS __source_rowid, * FROM ${quotedIdentifier(table)} WHERE rowid = ?`
    )
    .get(rowId) as Record<string, unknown> | undefined

  if (!row) {
    throw new Error(
      `Pricing foreign-key violation row is missing: ${table}:${rowId}`
    )
  }

  return {
    evidence: {
      foreignKeyId: violation.fkid,
      missingParentTable: violation.parent,
      row: sourceRow(row),
      sourceRowId: rowId,
    },
    sourceId: sourceId(row),
    sourceTable: table,
  }
}

export async function stagePricingExport(
  options: StagePricingExportOptions
): Promise<PricingStagingResult> {
  const [inventory, snapshot] = await Promise.all([
    inspectPricingExport(options.artifactPath),
    readPricingExportSnapshot(options.artifactPath),
  ])
  const unsupportedPopulatedTables = inventory.database.tables.filter(
    (table) =>
      table.disposition === "canonical" &&
      table.rowCount > 0 &&
      !(table.name in STAGING_COLUMNS)
  )
  if (unsupportedPopulatedTables.length > 0) {
    throw new Error(
      `Pricing staging does not support populated tables: ${unsupportedPopulatedTables
        .map((table) => table.name)
        .join(", ")}`
    )
  }

  const directory = await mkdtemp(join(tmpdir(), "mrmpl-pricing-staging-"))
  const databasePath = join(directory, "pricing_app.db")
  await writeFile(databasePath, snapshot.databaseContents)
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: true,
  })
  database.pragma("query_only = ON")

  const stagedRowsByTable: Record<string, number> = {}
  const pool = new Pool({ connectionString: options.connectionString })
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const migrationRun = await client.query<{ id: string }>(
      "SELECT id FROM migration.runs WHERE id = $1 FOR UPDATE",
      [options.migrationRunId]
    )
    if (migrationRun.rowCount !== 1) {
      throw new Error(`Migration run not found: ${options.migrationRunId}`)
    }

    const otherArtifacts = await client.query<{ sha256: string }>(
      `
        SELECT sha256
        FROM migration.artifacts
        WHERE migration_run_id = $1
          AND source_kind = 'sqlite'
          AND sha256 <> $2
      `,
      [options.migrationRunId, inventory.sha256]
    )
    if (otherArtifacts.rowCount !== 0) {
      throw new Error(
        "Migration run already references a different Pricing artifact"
      )
    }

    const artifactResult = await client.query<{ id: string }>(
      `
        INSERT INTO migration.artifacts (
          migration_run_id,
          source_kind,
          artifact_path,
          sha256,
          byte_size,
          table_inventory,
          extract_metadata
        )
        VALUES ($1, 'sqlite', $2, $3, $4, $5::jsonb, $6::jsonb)
        ON CONFLICT (migration_run_id, source_kind, sha256)
        DO UPDATE SET
          artifact_path = EXCLUDED.artifact_path,
          byte_size = EXCLUDED.byte_size,
          table_inventory = EXCLUDED.table_inventory,
          extract_metadata = EXCLUDED.extract_metadata
        RETURNING id
      `,
      [
        options.migrationRunId,
        options.artifactPath,
        inventory.sha256,
        inventory.byteSize,
        JSON.stringify(inventory.database.tables),
        JSON.stringify({
          database: {
            byteSize: inventory.database.byteSize,
            fileReferences: inventory.database.fileReferences,
            foreignKeyViolations: inventory.database.foreignKeyViolations,
            integrity: inventory.database.integrity,
            schemaObjects: inventory.database.schemaObjects,
            sha256: inventory.database.sha256,
          },
          databaseEntry: inventory.databaseEntry,
          manifest: inventory.manifest,
        }),
      ]
    )
    const artifactId = artifactResult.rows[0]!.id

    for (const [table, columns] of Object.entries(STAGING_COLUMNS) as Array<
      [SupportedTable, readonly string[]]
    >) {
      const tableInventory = inventory.database.tables.find(
        (candidate) => candidate.name === table
      )
      if (!tableInventory || tableInventory.rowCount === 0) {
        continue
      }

      const rows = database
        .prepare(
          `SELECT rowid AS __source_rowid, * FROM ${quotedIdentifier(table)} ORDER BY rowid`
        )
        .all() as Array<Record<string, unknown>>
      stagedRowsByTable[table] = rows.length
      await upsertRows(client, {
        artifactId,
        columns,
        migrationRunId: options.migrationRunId,
        rows,
        table,
      })
    }

    await client.query(
      `
        DELETE FROM migration.relationship_conflicts
        WHERE migration_run_id = $1
          AND source_system = 'pricing_sqlite'
      `,
      [options.migrationRunId]
    )
    for (const violation of inventory.database.foreignKeyViolations) {
      const conflict = foreignKeyConflict(violation, database)
      await client.query(
        `
          INSERT INTO migration.relationship_conflicts (
            migration_run_id,
            source_system,
            source_table,
            source_id,
            evidence
          )
          VALUES ($1, 'pricing_sqlite', $2, $3, $4::jsonb)
        `,
        [
          options.migrationRunId,
          conflict.sourceTable,
          conflict.sourceId,
          JSON.stringify(conflict.evidence),
        ]
      )
    }

    await client.query(
      "UPDATE migration.runs SET status = 'staging' WHERE id = $1",
      [options.migrationRunId]
    )
    await client.query("COMMIT")

    return {
      artifactId,
      migrationRunId: options.migrationRunId,
      relationshipConflicts: inventory.database.foreignKeyViolations.length,
      stagedRowsByTable,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
    database.close()
    await rm(directory, { force: true, recursive: true })
  }
}
