import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { migrateDatabase } from "@workspace/db"
import { strToU8, zipSync } from "fflate"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createMigrationRun, stageConvexExport } from "./convex-staging"
import { stagePricingExport } from "./pricing-staging"
import { inspectPricingDatabase } from "../pricing-database"
import { transformPricingFoundation } from "../transform/pricing-foundation"

const connectionString = process.env.TEST_DATABASE_URL
const temporaryDirectories: string[] = []
const pool = connectionString ? new Pool({ connectionString }) : undefined

describe.runIf(Boolean(connectionString))("Convex PostgreSQL staging", () => {
  beforeAll(async () => {
    await migrateDatabase({ connectionString: connectionString! })
    await pool!.query(`
      TRUNCATE
        sales.customers,
        catalog.material_grades,
        catalog.rod_types,
        catalog.machine_types
      CASCADE
    `)
    await pool!.query("DELETE FROM migration.source_id_map")
    await pool!.query("DELETE FROM migration.runs")
    await pool!.query(`
      INSERT INTO core.organizations (code, name)
      VALUES ('MRMPL', 'Mayank Raw Mint Private Limited')
      ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
    `)
  })

  afterAll(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true }))
    )
    await pool?.end()
  })

  test("stages canonical documents idempotently and gates unknown entry types", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mrmpl-convex-staging-"))
    temporaryDirectories.push(directory)
    const artifactPath = join(directory, "convex-export.zip")

    await writeFile(
      artifactPath,
      zipSync({
        "_tables/documents.jsonl": strToU8('{"name":"dataEntries"}\n'),
        "authSessions/documents.jsonl": strToU8(
          '{"_id":"session-1","userId":"user-1"}\n'
        ),
        "corrections/documents.jsonl": strToU8(
          '{"_creationTime":3,"_id":"correction-1","targetId":"entry-1","targetTable":"dataEntries"}\n'
        ),
        "dashboardSnapshotChunks/documents.jsonl": strToU8(
          '{"_creationTime":4,"_id":"chunk-1","sequence":0}\n'
        ),
        "dataEntries/documents.jsonl": strToU8(
          [
            '{"_creationTime":1,"_id":"entry-1","entryType":"work_order","payload":{"jcNo":"JC-1"}}',
            '{"_creationTime":2,"_id":"entry-2","entryType":"machine_master","payload":{"machine":"M-1"}}',
            '{"_creationTime":2.5,"_id":"entry-3","entryType":"_summary","payload":{"count":2}}',
            '{"_creationTime":2.75,"_id":"entry-4","entryType":"mystery_type","payload":{"value":1}}',
          ].join("\n") + "\n"
        ),
      })
    )

    const migrationRunId = await createMigrationRun({
      connectionString: connectionString!,
      gitCommit: "fixture-commit",
      operator: "migration-test",
      targetMigrationVersion: "0006",
    })
    const first = await stageConvexExport({
      artifactPath,
      connectionString: connectionString!,
      migrationRunId,
    })
    const second = await stageConvexExport({
      artifactPath,
      connectionString: connectionString!,
      migrationRunId,
    })

    expect(second).toEqual(first)
    expect(first.stagedRowsByTable).toEqual({
      corrections: 1,
      dataEntries: 4,
    })
    expect(first.unknownEntryTypes).toEqual({
      mystery_type: 1,
    })

    const documents = await pool!.query<{
      source_id: string
      source_table: string
    }>(
      `
        SELECT source_table, source_id
        FROM migration.convex_documents
        WHERE migration_run_id = $1
        ORDER BY source_table, source_id
      `,
      [migrationRunId]
    )
    expect(documents.rows).toEqual([
      {
        source_id: "correction-1",
        source_table: "corrections",
      },
      {
        source_id: "entry-1",
        source_table: "dataEntries",
      },
      {
        source_id: "entry-2",
        source_table: "dataEntries",
      },
      {
        source_id: "entry-3",
        source_table: "dataEntries",
      },
      {
        source_id: "entry-4",
        source_table: "dataEntries",
      },
    ])

    const artifacts = await pool!.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM migration.artifacts
        WHERE migration_run_id = $1
      `,
      [migrationRunId]
    )
    expect(artifacts.rows[0]?.count).toBe("1")

    const convexInventory = await pool!.query<{
      table_inventory: Array<{
        disposition: string
        name: string
        rowCount: number
      }>
    }>(
      `
        SELECT table_inventory
        FROM migration.artifacts
        WHERE migration_run_id = $1
          AND source_kind = 'convex'
      `,
      [migrationRunId]
    )
    expect(convexInventory.rows[0]?.table_inventory).toEqual(
      expect.arrayContaining([
        {
          disposition: "excluded_identity",
          name: "authSessions",
          rowCount: 1,
        },
        {
          disposition: "archive_only",
          name: "dashboardSnapshotChunks",
          rowCount: 1,
        },
      ])
    )
  })

  test("stages populated Pricing tables and records source FK conflicts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mrmpl-pricing-staging-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "pricing_app.db")
    const artifactPath = join(directory, "pricing-export.zip")
    const database = new DatabaseSync(databasePath)

    database.exec(`
      PRAGMA foreign_keys = OFF;

      CREATE TABLE app_users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL
      );

      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        customer_uid TEXT NOT NULL,
        company_name TEXT NOT NULL,
        status TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        country TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE enquiries (
        id INTEGER PRIMARY KEY
      );

      CREATE TABLE enquiry_import_reviews (
        id INTEGER PRIMARY KEY,
        enquiry_id INTEGER NOT NULL REFERENCES enquiries(id),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        applied_at TEXT
      );

      CREATE TABLE product_grades (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO app_users (id, username)
      VALUES (1, 'legacy-admin');

      INSERT INTO customers (
        id,
        customer_uid,
        company_name,
        status,
        created_at
      )
      VALUES (1, 'C-1', 'Fixture Customer', 'Active', '2026-07-18');

      INSERT INTO enquiry_import_reviews (
        id,
        enquiry_id,
        status,
        created_at
      )
      VALUES (1, 999, 'Open', '2026-07-18');

      INSERT INTO product_grades (id, name, created_at)
      VALUES (1, 'CW617N', '2026-07-18');
    `)
    database.close()

    const databaseContents = await readFile(databasePath)
    const databaseInventory = await inspectPricingDatabase(databasePath)
    const rowsByTable = Object.fromEntries(
      databaseInventory.tables.map((table) => [table.name, table.rowCount])
    )
    await writeFile(
      artifactPath,
      zipSync({
        "manifest.json": strToU8(
          JSON.stringify({
            created_at: "2026-07-18T15:03:37.801Z",
            integrity_check: "ok",
            rows_by_table: rowsByTable,
            snapshot: "pricing-data/pricing_app.db",
            snapshot_sha256: databaseInventory.sha256,
            snapshot_size_bytes: databaseContents.byteLength,
            source: "pricing-data/pricing_app.db",
            table_count: databaseInventory.tables.length,
            total_rows: databaseInventory.tables.reduce(
              (total, table) => total + table.rowCount,
              0
            ),
          })
        ),
        "pricing-data\\pricing_app.db": databaseContents,
      })
    )

    const migrationRunId = await createMigrationRun({
      connectionString: connectionString!,
      gitCommit: "fixture-commit",
      operator: "migration-test",
      targetMigrationVersion: "0007",
    })
    const first = await stagePricingExport({
      artifactPath,
      connectionString: connectionString!,
      migrationRunId,
    })
    const second = await stagePricingExport({
      artifactPath,
      connectionString: connectionString!,
      migrationRunId,
    })

    expect(second).toEqual(first)
    expect(first.stagedRowsByTable).toEqual({
      customers: 1,
      enquiry_import_reviews: 1,
      product_grades: 1,
    })
    expect(first.relationshipConflicts).toBe(1)

    const pricingInventory = await pool!.query<{
      table_inventory: Array<{
        disposition: string
        name: string
        rowCount: number
      }>
    }>(
      `
        SELECT table_inventory
        FROM migration.artifacts
        WHERE migration_run_id = $1
          AND source_kind = 'sqlite'
      `,
      [migrationRunId]
    )
    expect(pricingInventory.rows[0]?.table_inventory).toContainEqual({
      disposition: "excluded_identity",
      name: "app_users",
      rowCount: 1,
    })

    const customers = await pool!.query<{ company_name: string }>(
      `
        SELECT company_name
        FROM migration.sqlite_customers
        WHERE migration_run_id = $1
      `,
      [migrationRunId]
    )
    expect(customers.rows).toEqual([
      {
        company_name: "Fixture Customer",
      },
    ])

    const conflicts = await pool!.query<{
      source_id: string
      source_table: string
    }>(
      `
        SELECT source_table, source_id
        FROM migration.relationship_conflicts
        WHERE migration_run_id = $1
      `,
      [migrationRunId]
    )
    expect(conflicts.rows).toEqual([
      {
        source_id: "1",
        source_table: "enquiry_import_reviews",
      },
    ])

    const transformed = await transformPricingFoundation({
      connectionString: connectionString!,
      migrationRunId,
      organizationCode: "MRMPL",
      transformationVersion: "pricing-foundation-v1",
    })
    const transformedAgain = await transformPricingFoundation({
      connectionString: connectionString!,
      migrationRunId,
      organizationCode: "MRMPL",
      transformationVersion: "pricing-foundation-v1",
    })

    expect(transformedAgain).toEqual(transformed)
    expect(transformed).toEqual({
      customers: 1,
      machineTypes: 0,
      materialGrades: 1,
      rodTypes: 0,
      sourceMappings: 2,
    })

    const customerVersion = await pool!.query<{ row_version: string }>(
      `
        SELECT row_version::text AS row_version
        FROM sales.customers
        WHERE source_system = 'pricing_sqlite'
          AND source_table = 'customers'
          AND source_id = '1'
      `
    )
    expect(customerVersion.rows[0]?.row_version).toBe("1")

    const sourceMappings = await pool!.query<{
      source_id: string
      target_table: string
    }>(
      `
        SELECT source_id, target_table
        FROM migration.source_id_map
        WHERE migration_run_id = $1
        ORDER BY target_table, source_id
      `,
      [migrationRunId]
    )
    expect(sourceMappings.rows).toEqual([
      {
        source_id: "1",
        target_table: "customers",
      },
      {
        source_id: "1",
        target_table: "material_grades",
      },
    ])
  })
})
