import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { migrateDatabase } from "@workspace/db"
import { strToU8, zipSync } from "fflate"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createMigrationRun } from "../load/convex-staging"
import { stagePricingExport } from "../load/pricing-staging"
import { inspectPricingDatabase } from "../pricing-database"
import { transformPricingSnapshot } from "./pricing-snapshot"

const connectionString = process.env.TEST_DATABASE_URL
const temporaryDirectories: string[] = []
const pool = connectionString ? new Pool({ connectionString }) : undefined

async function createPricingArtifact() {
  const directory = await mkdtemp(join(tmpdir(), "mrmpl-pricing-transform-"))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, "pricing_app.db")
  const artifactPath = join(directory, "pricing-export.zip")
  const database = new DatabaseSync(databasePath)

  database.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY, customer_uid TEXT NOT NULL,
      company_name TEXT NOT NULL, status TEXT NOT NULL,
      contact_name TEXT, email TEXT, phone TEXT, country TEXT, notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE design_categories (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL,
      code TEXT
    );
    CREATE TABLE design_processes (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE design_subcategories (
      id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL,
      name TEXT NOT NULL, created_at TEXT NOT NULL, combination_code TEXT,
      FOREIGN KEY (category_id) REFERENCES design_categories(id)
    );
    CREATE TABLE enquiries (id INTEGER PRIMARY KEY);
    CREATE TABLE enquiry_items (id INTEGER PRIMARY KEY);
    CREATE TABLE quote_items (id INTEGER PRIMARY KEY);
    CREATE TABLE products (id INTEGER PRIMARY KEY);
    CREATE TABLE enquiry_import_reviews (
      id INTEGER PRIMARY KEY, enquiry_id INTEGER NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, applied_at TEXT,
      FOREIGN KEY (enquiry_id) REFERENCES enquiries(id)
    );
    CREATE TABLE enquiry_import_review_rows (
      id INTEGER PRIMARY KEY, review_id INTEGER NOT NULL, row_no INTEGER NOT NULL,
      part TEXT, description TEXT, grade TEXT, quantity REAL,
      target_price REAL, drawing_reference TEXT, remarks TEXT,
      classification TEXT NOT NULL, suggested_action TEXT NOT NULL,
      matched_quote_item_id INTEGER, matched_product_id INTEGER, match_note TEXT,
      created_enquiry_item_id INTEGER, applied_action TEXT,
      matched_enquiry_item_id INTEGER,
      FOREIGN KEY (review_id) REFERENCES enquiry_import_reviews(id),
      FOREIGN KEY (matched_quote_item_id) REFERENCES quote_items(id),
      FOREIGN KEY (matched_product_id) REFERENCES products(id),
      FOREIGN KEY (created_enquiry_item_id) REFERENCES enquiry_items(id),
      FOREIGN KEY (matched_enquiry_item_id) REFERENCES enquiry_items(id)
    );
    CREATE TABLE product_grades (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE product_machine_types (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE product_rod_types (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE quote_commercial_terms (
      id INTEGER PRIMARY KEY, term_type TEXT NOT NULL, name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE quote_material_rates (
      id INTEGER PRIMARY KEY, grade TEXT NOT NULL, rod_type TEXT NOT NULL,
      alloy_premium REAL NOT NULL, ext_cost REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE quote_packaging_options (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, packing_cost REAL NOT NULL,
      cost_basis TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE quote_shipping_terms (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, shipping_cost REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE website_applications (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE website_certifications (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE website_field_options (
      id INTEGER PRIMARY KEY, field_type TEXT NOT NULL, name TEXT NOT NULL,
      sort_order INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE app_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL);

    INSERT INTO counters VALUES ('customer_uid', 27);
    INSERT INTO customers VALUES (
      1, 'C-001', 'Fixture Customer', 'Active', 'Mayank',
      'mayank@example.com', '1234', 'IN', 'fixture', '2026-07-18 10:00:00'
    );
    INSERT INTO design_categories
      VALUES (1, 'Valves', '2026-07-18 10:00:00', 'VAL');
    INSERT INTO design_processes
      VALUES (1, 'Machining', '2026-07-18 10:00:00');
    INSERT INTO design_subcategories
      VALUES (1, 1, 'Ball Valves', '2026-07-18 10:00:00', 'VAL-BAL');
    INSERT INTO enquiry_import_reviews
      VALUES (1, 999, 'Applied', '2026-07-18 10:00:00', '2026-07-18 11:00:00');
    INSERT INTO enquiry_import_review_rows VALUES (
      1, 1, 2, 'P-001', 'Part', 'CW617N', 100, 25.5, 'DR-1', 'review',
      'New Line', 'Add New Line', NULL, NULL, 'No match', NULL,
      'Add New Line', NULL
    );
    INSERT INTO product_grades VALUES (1, 'CW617N', '2026-07-18 10:00:00');
    INSERT INTO product_machine_types
      VALUES (1, 'CNC', '2026-07-18 10:00:00');
    INSERT INTO product_rod_types
      VALUES (1, 'Round', '2026-07-18 10:00:00');
    INSERT INTO quote_commercial_terms
      VALUES (1, 'Payment', '30 days', '2026-07-18 10:00:00');
    INSERT INTO quote_material_rates
      VALUES (1, 'CW617N', 'Round', 12.25, 4.75, '2026-07-18 10:00:00');
    INSERT INTO quote_packaging_options
      VALUES (1, 'Box', 8.5, 'Per 100 pcs', '2026-07-18 10:00:00');
    INSERT INTO quote_shipping_terms
      VALUES (1, 'FOB', 15.5, '2026-07-18 10:00:00');
    INSERT INTO website_applications
      VALUES (1, 'Industrial', 3, '2026-07-18 10:00:00');
    INSERT INTO website_certifications
      VALUES (1, 'ISO 9001', 4, '2026-07-18 10:00:00');
    INSERT INTO website_field_options
      VALUES (1, 'finish', 'Chrome', 5, '2026-07-18 10:00:00');
    INSERT INTO app_users VALUES (1, 'legacy-admin');
  `)
  database.close()

  const databaseContents = await readFile(databasePath)
  const inventory = await inspectPricingDatabase(databasePath)
  await writeFile(
    artifactPath,
    zipSync({
      "manifest.json": strToU8(
        JSON.stringify({
          created_at: "2026-07-18T15:03:37.801Z",
          integrity_check: "ok",
          rows_by_table: Object.fromEntries(
            inventory.tables.map((table) => [table.name, table.rowCount])
          ),
          snapshot: "pricing-data/pricing_app.db",
          snapshot_sha256: inventory.sha256,
          snapshot_size_bytes: databaseContents.byteLength,
          source: "pricing-data/pricing_app.db",
          table_count: inventory.tables.length,
          total_rows: inventory.tables.reduce(
            (total, table) => total + table.rowCount,
            0
          ),
        })
      ),
      "pricing-data/pricing_app.db": databaseContents,
    })
  )

  return artifactPath
}

describe.runIf(Boolean(connectionString))(
  "complete Pricing PostgreSQL transformation",
  () => {
    beforeAll(async () => {
      await migrateDatabase({ connectionString: connectionString! })
      await pool!.query(`
        TRUNCATE
          sales.enquiry_import_review_rows,
          sales.enquiry_import_reviews,
          sales.commercial_terms,
          sales.material_rates,
          sales.packaging_options,
          sales.shipping_terms,
          sales.customers,
          catalog.item_subcategories,
          catalog.item_categories,
          catalog.design_processes,
          catalog.website_applications,
          catalog.website_certifications,
          catalog.website_field_options,
          catalog.material_grades,
          catalog.rod_types,
          catalog.machine_types,
          core.number_sequences
        CASCADE
      `)
      await pool!.query("DELETE FROM migration.source_id_map")
      await pool!.query("DELETE FROM migration.runs")
      await pool!.query(`
        INSERT INTO core.organizations (code, name)
        VALUES ('MRMPL-TRANSFORM', 'Migration fixture')
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

    test("maps, hashes, and reconciles every business row idempotently", async () => {
      const artifactPath = await createPricingArtifact()
      const migrationRunId = await createMigrationRun({
        connectionString: connectionString!,
        gitCommit: "fixture-commit",
        operator: "migration-test",
        targetMigrationVersion: "0009",
      })
      await stagePricingExport({
        artifactPath,
        connectionString: connectionString!,
        migrationRunId,
      })

      const options = {
        connectionString: connectionString!,
        migrationRunId,
        organizationCode: "MRMPL-TRANSFORM",
        transformationVersion: "pricing-snapshot-v1",
      }
      const first = await transformPricingSnapshot(options)
      const second = await transformPricingSnapshot(options)

      expect(second).toEqual(first)
      expect(first).toMatchObject({
        canonicalTables: 21,
        hashMatches: 17,
        sourceMappings: 17,
        sourceRows: 17,
        transformedRows: 17,
      })

      const preservedValues = await pool!.query<{
        alloy_premium: string
        combination_code: string
        cost_basis: string
        extrusion_cost: string
        sort_order: number
        term_type: string
      }>(`
        SELECT
          rates.alloy_premium::text,
          rates.extrusion_cost::text,
          packaging.cost_basis,
          terms.term_type,
          categories.combination_code,
          applications.sort_order
        FROM sales.material_rates AS rates
        CROSS JOIN sales.packaging_options AS packaging
        CROSS JOIN sales.commercial_terms AS terms
        CROSS JOIN catalog.item_subcategories AS categories
        CROSS JOIN catalog.website_applications AS applications
        WHERE rates.source_system = 'pricing_sqlite'
      `)
      expect(preservedValues.rows).toEqual([
        {
          alloy_premium: "12.250000",
          combination_code: "VAL-BAL",
          cost_basis: "Per 100 pcs",
          extrusion_cost: "4.750000",
          sort_order: 3,
          term_type: "Payment",
        },
      ])

      const importEvidence = await pool!.query<{
        applied_action: string | null
        match_note: string | null
        row_number: number
        status: string
        suggested_action: string | null
      }>(
        `
          SELECT row_number, status, suggested_action, applied_action,
            match_note
          FROM sales.enquiry_import_review_rows
          WHERE source_system = 'pricing_sqlite'
        `
      )
      expect(importEvidence.rows).toEqual([
        {
          applied_action: "Add New Line",
          match_note: "No match",
          row_number: 2,
          status: "New Line",
          suggested_action: "Add New Line",
        },
      ])

      const reconciliation = await pool!.query<{
        failed: string
        table_checks: string
      }>(
        `
          SELECT
            count(*) FILTER (WHERE status = 'fail')::text AS failed,
            count(*) FILTER (
              WHERE check_key = 'pricing_table_row_count'
            )::text AS table_checks
          FROM migration.validation_results
          WHERE migration_run_id = $1
        `,
        [migrationRunId]
      )
      expect(reconciliation.rows[0]).toEqual({
        failed: "0",
        table_checks: "21",
      })

      const versions = await pool!.query<{
        maximum: string
        minimum: string
      }>(`
        SELECT
          min(row_version)::text AS minimum,
          max(row_version)::text AS maximum
        FROM (
          SELECT row_version FROM sales.customers
          UNION ALL SELECT row_version FROM catalog.item_categories
          UNION ALL SELECT row_version FROM sales.material_rates
          UNION ALL SELECT row_version FROM catalog.website_field_options
        ) AS transformed
      `)
      expect(versions.rows[0]).toEqual({ maximum: "1", minimum: "1" })
    })
  }
)
