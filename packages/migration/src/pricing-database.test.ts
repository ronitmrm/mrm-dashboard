import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import Database from "better-sqlite3"
import { strToU8, zipSync } from "fflate"
import { afterEach, expect, test } from "vitest"

import {
  inspectPricingDatabase,
  inspectPricingExport,
} from "./pricing-database"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

test("Pricing inventory checks integrity and excludes legacy identity tables", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mrmpl-pricing-database-"))
  temporaryDirectories.push(directory)
  const artifactPath = join(directory, "pricing_app.db")
  const database = new Database(artifactPath)

  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      customer_uid TEXT NOT NULL,
      company_name TEXT NOT NULL,
      drawing_reference TEXT
    );

    CREATE TABLE app_users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL
    );

    CREATE TABLE app_user_permissions (
      user_id INTEGER NOT NULL REFERENCES app_users(id),
      page_key TEXT NOT NULL
    );

    CREATE TABLE app_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_users(id)
    );

    CREATE INDEX customers_company_name_idx
      ON customers (company_name);

    INSERT INTO customers (
      id,
      customer_uid,
      company_name,
      drawing_reference
    )
    VALUES (1, '1', 'Fixture Customer', 'drawings/fixture.pdf');

    INSERT INTO app_users (id, username)
    VALUES (1, 'legacy-admin');

    INSERT INTO app_user_permissions (user_id, page_key)
    VALUES (1, 'dashboard');

    INSERT INTO app_sessions (id, user_id)
    VALUES ('session-1', 1);
  `)
  database.close()

  const inventory = await inspectPricingDatabase(artifactPath)

  expect(inventory.integrity).toBe("ok")
  expect(inventory.foreignKeyViolations).toEqual([])
  expect(inventory.tables).toEqual([
    {
      disposition: "excluded_identity",
      name: "app_sessions",
      rowCount: 1,
    },
    {
      disposition: "excluded_identity",
      name: "app_user_permissions",
      rowCount: 1,
    },
    {
      disposition: "excluded_identity",
      name: "app_users",
      rowCount: 1,
    },
    {
      disposition: "canonical",
      name: "customers",
      rowCount: 1,
    },
  ])
  expect(inventory.workingTables).toEqual(["customers"])
  expect(inventory.fileReferences).toEqual([
    {
      column: "drawing_reference",
      sourceRowId: 1,
      table: "customers",
      value: "drawings/fixture.pdf",
    },
  ])
  expect(inventory.schemaObjects).toContainEqual({
    name: "customers_company_name_idx",
    sql: "CREATE INDEX customers_company_name_idx\n      ON customers (company_name)",
    tableName: "customers",
    type: "index",
  })
  expect(inventory.byteSize).toBeGreaterThan(0)
  expect(inventory.sha256).toMatch(/^[a-f0-9]{64}$/)
})

test("Pricing ZIP inventory verifies its manifest and embedded SQLite snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mrmpl-pricing-export-"))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, "pricing_app.db")
  const artifactPath = join(directory, "pricing-export.zip")
  const database = new Database(databasePath)

  database.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      company_name TEXT NOT NULL
    );

    INSERT INTO customers (id, company_name)
    VALUES (1, 'Fixture Customer');
  `)
  database.close()

  const databaseContents = await readFile(databasePath)
  const databaseInventory = await inspectPricingDatabase(databasePath)
  const manifest = {
    created_at: "2026-07-18T15:03:37.801Z",
    integrity_check: "ok",
    rows_by_table: {
      customers: 1,
    },
    snapshot: "pricing-data/pricing_app.db",
    snapshot_sha256: databaseInventory.sha256,
    snapshot_size_bytes: databaseContents.byteLength,
    source: "pricing-data/pricing_app.db",
    table_count: 1,
    total_rows: 1,
  }

  await writeFile(
    artifactPath,
    zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "pricing-data\\pricing_app.db": databaseContents,
    })
  )

  const inventory = await inspectPricingExport(artifactPath)

  expect(inventory.databaseEntry).toBe("pricing-data/pricing_app.db")
  expect(inventory.manifest).toEqual(manifest)
  expect(inventory.database.integrity).toBe("ok")
  expect(inventory.database.tables).toEqual([
    {
      disposition: "canonical",
      name: "customers",
      rowCount: 1,
    },
  ])
  expect(inventory.byteSize).toBeGreaterThan(0)
  expect(inventory.database.byteSize).toBe(databaseContents.byteLength)
  expect(inventory.sha256).toMatch(/^[a-f0-9]{64}$/)
})

test("Pricing inspection rejects an unsafe archive entry before opening SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mrmpl-pricing-unsafe-"))
  temporaryDirectories.push(directory)
  const artifactPath = join(directory, "unsafe-export.zip")

  await writeFile(
    artifactPath,
    zipSync({
      "../outside.txt": strToU8("unsafe"),
      "manifest.json": strToU8(
        JSON.stringify({
          created_at: "2026-07-18T15:03:37.801Z",
          integrity_check: "ok",
          rows_by_table: {},
          snapshot: "pricing-data/pricing_app.db",
          snapshot_sha256:
            "0000000000000000000000000000000000000000000000000000000000000000",
          snapshot_size_bytes: 0,
          source: "pricing-data/pricing_app.db",
          table_count: 0,
          total_rows: 0,
        })
      ),
      "pricing-data/pricing_app.db": new Uint8Array(),
    })
  )

  await expect(inspectPricingExport(artifactPath)).rejects.toThrow("unsafe")
})
