import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createCustomerRepository } from "./customers"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const expectedSchemas = [
  "audit",
  "catalog",
  "core",
  "derived",
  "identity",
  "maintenance",
  "manufacturing",
  "migration",
  "quality",
  "sales",
  "workforce",
] as const

const pool = new Pool({ connectionString })

beforeAll(async () => {
  for (const schema of expectedSchemas) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  }
})

afterAll(async () => {
  await pool.end()
})

test("an empty database migrates into the MRMPL bounded contexts", async () => {
  await migrateDatabase({ connectionString })

  const result = await pool.query<{ schema_name: string }>(
    `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = ANY($1::text[])
      ORDER BY schema_name
    `,
    [expectedSchemas]
  )

  expect(result.rows.map((row) => row.schema_name)).toEqual(expectedSchemas)
})

test("identity starts fresh without legacy Pricing auth tables", async () => {
  await migrateDatabase({ connectionString })

  const result = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'identity'
    ORDER BY table_name
  `)

  expect(result.rows.map((row) => row.table_name)).toEqual([
    "accounts",
    "permissions",
    "role_permissions",
    "roles",
    "sessions",
    "user_permission_overrides",
    "user_roles",
    "users",
    "verifications",
  ])

  const userId = await pool.query<{ data_type: string }>(`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'identity'
      AND table_name = 'users'
      AND column_name = 'id'
  `)

  expect(userId.rows[0]?.data_type).toBe("uuid")
  expect(
    result.rows.some((row) =>
      ["app_users", "app_user_permissions", "app_sessions"].includes(
        row.table_name
      )
    )
  ).toBe(false)
})

test("authorization seeds every unified application module", async () => {
  await migrateDatabase({ connectionString })

  const result = await pool.query<{ module: string }>(`
    SELECT DISTINCT module
    FROM identity.permissions
    ORDER BY module
  `)

  expect(result.rows.map((row) => row.module)).toEqual([
    "administration",
    "hr",
    "maintenance",
    "operations",
    "planning",
    "pricing",
    "quality",
  ])
})

test("foundation includes provenance, conflict review, and durable work tables", async () => {
  await migrateDatabase({ connectionString })

  const result = await pool.query<{
    table_name: string
    table_schema: string
  }>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('derived', 'migration')
    ORDER BY table_schema, table_name
  `)

  expect(
    result.rows.map((row) => `${row.table_schema}.${row.table_name}`)
  ).toEqual([
    "derived.dashboard_read_models",
    "derived.outbox_events",
    "derived.refresh_jobs",
    "derived.refresh_watermarks",
    "migration.artifacts",
    "migration.convex_documents",
    "migration.file_conflicts",
    "migration.identity_conflicts",
    "migration.orphan_corrections",
    "migration.relationship_conflicts",
    "migration.runs",
    "migration.schema_migrations",
    "migration.source_hashes",
    "migration.source_id_map",
    "migration.type_conflicts",
    "migration.unknown_entry_types",
    "migration.validation_results",
  ])
})

test("Pricing customers are created and listed through the PostgreSQL repository", async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(`
    INSERT INTO core.organizations (code, name)
    VALUES ('MRMPL', 'Mayank Raw Mint Private Limited')
    ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `)
  const repository = createCustomerRepository({ connectionString })

  try {
    const created = await repository.create({
      companyName: "Fixture Brass Customer",
      country: "India",
      customerUid: " 001 ",
      organizationId: organization.rows[0]!.id,
      source: {
        id: "1",
        system: "pricing_sqlite",
        table: "customers",
      },
    })

    expect(created).toMatchObject({
      companyName: "Fixture Brass Customer",
      country: "India",
      customerUid: "001",
    })
    await expect(repository.list(organization.rows[0]!.id)).resolves.toEqual([
      created,
    ])
    await expect(repository.listForOrganization("mrmpl")).resolves.toEqual([
      created,
    ])
  } finally {
    await repository.close()
  }
})
