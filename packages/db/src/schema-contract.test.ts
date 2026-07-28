import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createCatalogMasterRepository } from "./catalog-masters"
import { createCustomerRepository } from "./customers"
import { migrateDatabase } from "./migrate"
import { createProductRepository } from "./products"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

function assertDisposableLocalDatabase(value: string) {
  const url = new URL(value)
  const hostname = url.hostname.toLowerCase()
  const databaseName = decodeURIComponent(url.pathname.slice(1))
  const isLoopback = ["127.0.0.1", "::1", "[::1]", "localhost"].includes(
    hostname
  )
  const isTestDatabase = /(^|[-_])test($|[-_])/i.test(databaseName)

  if (!isLoopback || !isTestDatabase) {
    throw new Error(
      "schema-contract.test.ts is destructive and only runs against a loopback database whose name contains 'test'."
    )
  }
}

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
  "recruitment",
  "sales",
  "workforce",
] as const

const expectedCanonicalTables = [
  "audit.events",
  "audit.legacy_convex_corrections",
  "audit.legacy_pricing_corrections",
  "audit.pricing_correction_requests",
  "audit.record_reversals",
  "catalog.bom_lines",
  "catalog.design_processes",
  "catalog.drawings",
  "catalog.item_aliases",
  "catalog.item_categories",
  "catalog.item_subcategories",
  "catalog.items",
  "catalog.machine_types",
  "catalog.machines",
  "catalog.material_grades",
  "catalog.rod_types",
  "catalog.website_applications",
  "catalog.website_certifications",
  "catalog.website_field_options",
  "catalog.website_product_profiles",
  "core.file_links",
  "core.files",
  "core.number_sequences",
  "core.organizations",
  "maintenance.checklist_items",
  "maintenance.definitions",
  "maintenance.machine_schedules",
  "maintenance.task_results",
  "maintenance.tasks",
  "manufacturing.dispatch_approval_events",
  "manufacturing.downtime_reasons",
  "manufacturing.machine_constraint_event_details",
  "manufacturing.machine_constraint_events",
  "manufacturing.operation_cycle_standards",
  "manufacturing.operation_setups",
  "manufacturing.operation_tooling",
  "manufacturing.plan_override_event_details",
  "manufacturing.plan_override_events",
  "manufacturing.planner_priority_event_details",
  "manufacturing.planner_priority_events",
  "manufacturing.planning_calendar_exceptions",
  "manufacturing.production_card_events",
  "manufacturing.production_cards",
  "manufacturing.production_entries",
  "manufacturing.raw_material_receipts",
  "manufacturing.route_change_event_setups",
  "manufacturing.route_change_events",
  "manufacturing.route_options",
  "manufacturing.route_selections",
  "manufacturing.setup_completion_events",
  "manufacturing.shop_floor_setup_state",
  "manufacturing.shop_floor_stage_events",
  "manufacturing.work_orders",
  "quality.first_piece_inspections",
  "quality.first_piece_reading_samples",
  "quality.first_piece_readings",
  "quality.hourly_check_readings",
  "quality.hourly_checks",
  "quality.parameter_definitions",
  "quality.rejection_reasons",
  "quality.rejection_remarks",
  "quality.rejection_types",
  "quality.setup_checklist_results",
  "quality.setup_checklist_sessions",
  "quality.setup_checklist_template_items",
  "quality.setup_checklist_templates",
  "recruitment.applications",
  "recruitment.candidate_departments",
  "recruitment.candidate_events",
  "recruitment.candidates",
  "recruitment.combined_role_posts",
  "recruitment.combined_roles",
  "recruitment.departments",
  "recruitment.designations",
  "recruitment.interviews",
  "recruitment.job_posts",
  "recruitment.posts",
  "recruitment.requirement_templates",
  "sales.bulk_price_revision_changes",
  "sales.bulk_price_revisions",
  "sales.clarification_tasks",
  "sales.commercial_terms",
  "sales.customer_contacts",
  "sales.customers",
  "sales.design_bom_lines",
  "sales.design_tasks",
  "sales.engineering_change_decisions",
  "sales.engineering_change_notes",
  "sales.enquiries",
  "sales.enquiry_import_review_rows",
  "sales.enquiry_import_reviews",
  "sales.enquiry_item_revisions",
  "sales.enquiry_items",
  "sales.followups",
  "sales.material_rates",
  "sales.packaging_options",
  "sales.proforma_invoice_lines",
  "sales.proforma_invoices",
  "sales.purchase_order_lines",
  "sales.purchase_orders",
  "sales.quote_items",
  "sales.quote_package_components",
  "sales.quote_product_snapshots",
  "sales.quote_revision_requests",
  "sales.quote_term_templates",
  "sales.quote_terms",
  "sales.shipping_terms",
  "workforce.attendance_record_events",
  "workforce.attendance_records",
  "workforce.employee_aliases",
  "workforce.employees",
  "workforce.training_records",
] as const

const pool = new Pool({ connectionString })

beforeAll(async () => {
  assertDisposableLocalDatabase(connectionString)
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

test("the complete canonical bounded-context table contract is present", async () => {
  await migrateDatabase({ connectionString })

  const result = await pool.query<{
    table_name: string
    table_schema: string
  }>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = ANY(
      ARRAY[
        'audit',
        'catalog',
        'core',
        'maintenance',
        'manufacturing',
        'quality',
        'recruitment',
        'sales',
        'workforce'
      ]
    )
    ORDER BY table_schema, table_name
  `)

  expect(
    result.rows.map((row) => `${row.table_schema}.${row.table_name}`)
  ).toEqual(expectedCanonicalTables)
})

test("canonical columns use the approved PostgreSQL types and mutable-row contract", async () => {
  await migrateDatabase({ connectionString })

  const types = await pool.query<{
    column_name: string
    data_type: string
    numeric_precision: number | null
    numeric_scale: number | null
    table_name: string
    table_schema: string
  }>(`
    SELECT
      table_schema,
      table_name,
      column_name,
      data_type,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns
    WHERE (table_schema, table_name, column_name) IN (
      ('sales', 'quote_items', 'unit_price'),
      ('manufacturing', 'production_entries', 'quantity_good'),
      ('manufacturing', 'work_orders', 'due_date'),
      ('manufacturing', 'planner_priority_events', 'occurred_at'),
      ('workforce', 'attendance_records', 'clock_in')
    )
    ORDER BY table_schema, table_name, column_name
  `)

  expect(types.rows).toEqual([
    {
      column_name: "occurred_at",
      data_type: "timestamp with time zone",
      numeric_precision: null,
      numeric_scale: null,
      table_name: "planner_priority_events",
      table_schema: "manufacturing",
    },
    {
      column_name: "quantity_good",
      data_type: "numeric",
      numeric_precision: 20,
      numeric_scale: 8,
      table_name: "production_entries",
      table_schema: "manufacturing",
    },
    {
      column_name: "due_date",
      data_type: "date",
      numeric_precision: null,
      numeric_scale: null,
      table_name: "work_orders",
      table_schema: "manufacturing",
    },
    {
      column_name: "unit_price",
      data_type: "numeric",
      numeric_precision: 18,
      numeric_scale: 6,
      table_name: "quote_items",
      table_schema: "sales",
    },
    {
      column_name: "clock_in",
      data_type: "time without time zone",
      numeric_precision: null,
      numeric_scale: null,
      table_name: "attendance_records",
      table_schema: "workforce",
    },
  ])

  const sharedColumns = await pool.query<{
    column_name: string
    table_name: string
    table_schema: string
  }>(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE (table_schema, table_name) IN (
      ('sales', 'enquiries'),
      ('manufacturing', 'work_orders'),
      ('quality', 'parameter_definitions'),
      ('maintenance', 'definitions')
    )
      AND column_name = ANY(
        ARRAY[
          'id',
          'organization_id',
          'created_at',
          'updated_at',
          'created_by_user_id',
          'updated_by_user_id',
          'row_version',
          'source_system',
          'source_table',
          'source_id',
          'source_payload'
        ]
      )
    ORDER BY table_schema, table_name, column_name
  `)

  const grouped = new Map<string, typeof sharedColumns.rows>()
  for (const row of sharedColumns.rows) {
    const key = `${row.table_schema}.${row.table_name}`
    const columns = grouped.get(key) ?? []
    columns.push(row)
    grouped.set(key, columns)
  }
  for (const table of [
    "maintenance.definitions",
    "manufacturing.work_orders",
    "quality.parameter_definitions",
    "sales.enquiries",
  ]) {
    expect(
      grouped
        .get(table)
        ?.map((row) => row.column_name)
        .sort()
    ).toEqual([
      "created_at",
      "created_by_user_id",
      "id",
      "organization_id",
      "row_version",
      "source_id",
      "source_payload",
      "source_system",
      "source_table",
      "updated_at",
      "updated_by_user_id",
    ])
  }
})

test("commercial import review and follow-up fidelity columns are explicit", async () => {
  await migrateDatabase({ connectionString })

  const columns = await pool.query<{
    column_default: string | null
    column_name: string
    data_type: string
    is_nullable: "NO" | "YES"
    table_name: string
  }>(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'sales'
      AND (table_name, column_name) IN (
        ('enquiry_import_review_rows', 'matched_quote_item_id'),
        ('enquiry_import_review_rows', 'match_note'),
        ('followups', 'quote_item_id'),
        ('followups', 'channel')
      )
    ORDER BY table_name, column_name
  `)

  expect(columns.rows).toEqual([
    {
      column_default: null,
      column_name: "match_note",
      data_type: "text",
      is_nullable: "YES",
      table_name: "enquiry_import_review_rows",
    },
    {
      column_default: null,
      column_name: "matched_quote_item_id",
      data_type: "uuid",
      is_nullable: "YES",
      table_name: "enquiry_import_review_rows",
    },
    {
      column_default: "'Email'::text",
      column_name: "channel",
      data_type: "text",
      is_nullable: "NO",
      table_name: "followups",
    },
    {
      column_default: null,
      column_name: "quote_item_id",
      data_type: "uuid",
      is_nullable: "YES",
      table_name: "followups",
    },
  ])
})

test("critical lineage, machine-lock, and quality-scope invariants are indexed", async () => {
  await migrateDatabase({ connectionString })

  const indexes = await pool.query<{ indexname: string }>(`
    SELECT indexname
    FROM pg_indexes
    WHERE indexname = ANY(
      ARRAY[
        'quote_items_active_price_unique',
        'quote_items_active_blank_child_unique',
        'enquiry_import_review_rows_quote_idx',
        'followups_quote_item_idx',
        'shop_floor_active_machine_unique',
        'quality_parameter_scope_unique'
      ]
    )
    ORDER BY indexname
  `)

  expect(indexes.rows.map((row) => row.indexname)).toEqual([
    "enquiry_import_review_rows_quote_idx",
    "followups_quote_item_idx",
    "quality_parameter_scope_unique",
    "quote_items_active_blank_child_unique",
    "quote_items_active_price_unique",
    "shop_floor_active_machine_unique",
  ])
})

test("database roles enforce least privilege across migration, web, worker, and reporting", async () => {
  await migrateDatabase({ connectionString })

  const roles = await pool.query<{
    rolcanlogin: boolean
    rolcreatedb: boolean
    rolcreaterole: boolean
    rolinherit: boolean
    rolname: string
    rolsuper: boolean
  }>(`
    SELECT
      rolname,
      rolsuper,
      rolcreatedb,
      rolcreaterole,
      rolinherit,
      rolcanlogin
    FROM pg_roles
    WHERE rolname = ANY(
      ARRAY[
        'mrmpl_migration',
        'mrmpl_reporting',
        'mrmpl_web',
        'mrmpl_worker'
      ]
    )
    ORDER BY rolname
  `)

  expect(roles.rows).toEqual(
    ["mrmpl_migration", "mrmpl_reporting", "mrmpl_web", "mrmpl_worker"].map(
      (rolname) => ({
        rolcanlogin: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolname,
        rolsuper: false,
      })
    )
  )

  const privileges = await pool.query<{
    migration_can_migrate: boolean
    reporting_can_update_quotes: boolean
    reporting_reads_quotes: boolean
    web_can_delete_customers: boolean
    web_can_execute_try_date: boolean
    web_can_execute_try_timestamptz: boolean
    web_can_migrate: boolean
    web_can_read_migration_evidence: boolean
    web_can_use_migration_schema: boolean
    web_writes_customers: boolean
    worker_reads_work_orders: boolean
    worker_writes_work_orders: boolean
  }>(`
    SELECT
      has_table_privilege('mrmpl_web', 'sales.customers', 'INSERT')
        AS web_writes_customers,
      has_table_privilege('mrmpl_web', 'sales.customers', 'DELETE')
        AS web_can_delete_customers,
      has_table_privilege('mrmpl_web', 'migration.schema_migrations', 'INSERT')
        AS web_can_migrate,
      has_table_privilege('mrmpl_web', 'migration.schema_migrations', 'SELECT')
        AS web_can_read_migration_evidence,
      has_schema_privilege('mrmpl_web', 'migration', 'USAGE')
        AS web_can_use_migration_schema,
      has_function_privilege(
        'mrmpl_web',
        'migration.try_date(text)',
        'EXECUTE'
      ) AS web_can_execute_try_date,
      has_function_privilege(
        'mrmpl_web',
        'migration.try_timestamptz(text)',
        'EXECUTE'
      ) AS web_can_execute_try_timestamptz,
      has_table_privilege('mrmpl_worker', 'manufacturing.work_orders', 'SELECT')
        AS worker_reads_work_orders,
      has_table_privilege('mrmpl_worker', 'manufacturing.work_orders', 'INSERT')
        AS worker_writes_work_orders,
      has_table_privilege('mrmpl_reporting', 'sales.quote_items', 'SELECT')
        AS reporting_reads_quotes,
      has_table_privilege('mrmpl_reporting', 'sales.quote_items', 'UPDATE')
        AS reporting_can_update_quotes,
      has_table_privilege('mrmpl_migration', 'migration.schema_migrations', 'INSERT')
        AS migration_can_migrate
  `)

  expect(privileges.rows[0]).toEqual({
    migration_can_migrate: true,
    reporting_can_update_quotes: false,
    reporting_reads_quotes: true,
    web_can_delete_customers: false,
    web_can_execute_try_date: true,
    web_can_execute_try_timestamptz: true,
    web_can_migrate: false,
    web_can_read_migration_evidence: false,
    web_can_use_migration_schema: true,
    web_writes_customers: true,
    worker_reads_work_orders: true,
    worker_writes_work_orders: false,
  })
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
    "derived.refresh_job_attempts",
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
    "migration.sqlite_counters",
    "migration.sqlite_customers",
    "migration.sqlite_design_categories",
    "migration.sqlite_design_processes",
    "migration.sqlite_design_subcategories",
    "migration.sqlite_enquiry_import_review_rows",
    "migration.sqlite_enquiry_import_reviews",
    "migration.sqlite_product_grades",
    "migration.sqlite_product_machine_types",
    "migration.sqlite_product_rod_types",
    "migration.sqlite_quote_commercial_terms",
    "migration.sqlite_quote_material_rates",
    "migration.sqlite_quote_packaging_options",
    "migration.sqlite_quote_shipping_terms",
    "migration.sqlite_website_applications",
    "migration.sqlite_website_certifications",
    "migration.sqlite_website_field_options",
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

test("Pricing products preserve creation-time costing rules in PostgreSQL", async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `SELECT id FROM core.organizations WHERE lower(code) = 'mrmpl'`
  )
  const repository = createProductRepository({ connectionString })

  try {
    const created = await repository.create({
      assemblyOperationCost: 5,
      casting: 2,
      description: "Fixture barstock package",
      forgingCost: 12,
      itemType: "Package",
      machiningCost: 10,
      organizationId: organization.rows[0]!.id,
      overheadCost: 9,
      productionType: "Barstock",
      source: {
        id: "101",
        system: "pricing_sqlite",
        table: "products",
      },
      uid: " MRM-100 ",
      weight100Pcs: 500,
    })

    expect(created).toMatchObject({
      assemblyOperationCost: "5.00000000",
      description: "Fixture barstock package",
      forgingCost: "0.00000000",
      machiningPricePerPiece: "5.00000000",
      overheadCost: "0.00000000",
      piecesPerKg: "2.00000000",
      uid: "MRM-100",
    })
    await expect(repository.list(organization.rows[0]!.id)).resolves.toEqual([
      created,
    ])
    await expect(repository.listForOrganization("MRMPL")).resolves.toEqual([
      created,
    ])
  } finally {
    await repository.close()
  }
})

test("Pricing catalog masters are case-insensitive and source-traceable", async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `SELECT id FROM core.organizations WHERE lower(code) = 'mrmpl'`
  )
  const repository = createCatalogMasterRepository({
    connectionString,
    kind: "materialGrade",
  })

  try {
    const created = await repository.create({
      name: " CW617N ",
      organizationId: organization.rows[0]!.id,
      source: {
        id: "1",
        system: "pricing_sqlite",
        table: "product_grades",
      },
    })
    const duplicate = await repository.create({
      name: "cw617n",
      organizationId: organization.rows[0]!.id,
      source: {
        id: "2",
        system: "pricing_sqlite",
        table: "product_grades",
      },
    })

    expect(created).toMatchObject({
      name: "CW617N",
      sourceId: "1",
      sourceTable: "product_grades",
    })
    expect(duplicate.id).toBe(created.id)
    await expect(repository.list(organization.rows[0]!.id)).resolves.toEqual([
      created,
    ])
  } finally {
    await repository.close()
  }
})
