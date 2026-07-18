import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import Database from "better-sqlite3"
import { afterEach, expect, test } from "vitest"

import { inspectPricingDatabase } from "./pricing-database"

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
      company_name TEXT NOT NULL
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

    INSERT INTO customers (id, customer_uid, company_name)
    VALUES (1, '1', 'Fixture Customer');

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
  expect(inventory.byteSize).toBeGreaterThan(0)
  expect(inventory.sha256).toMatch(/^[a-f0-9]{64}$/)
})
