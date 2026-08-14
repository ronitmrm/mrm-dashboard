import { randomUUID } from "node:crypto"

import { Client, Pool, type Notification } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import publishedChecksums from "../migrations/published-checksums.json"

import { createCatalogMasterRepository } from "./catalog-masters"
import { createCustomerRepository } from "./customers"
import { createDashboardReadModelRepository } from "./dashboard-read-model-repository"
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
  "manufacturing.production_floors",
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
const representativeOrganizationId = "00000000-0000-4000-8000-000000000038"
const dashboardRefreshChannel = "mrm_dashboard_refresh"

async function captureNotificationsBeforeSentinel(
  listener: Client,
  writer: Client,
  operation: () => Promise<void>
) {
  const sentinel = JSON.stringify({ sentinel: randomUUID() })
  const payloads: string[] = []
  let timeout: ReturnType<typeof setTimeout> | undefined
  let finish: ((value: void | PromiseLike<void>) => void) | undefined
  let fail: ((reason?: unknown) => void) | undefined
  const completed = new Promise<void>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  const onNotification = (notification: Notification) => {
    if (notification.channel !== dashboardRefreshChannel) return
    if (notification.payload === sentinel) {
      finish?.()
      return
    }
    if (notification.payload) payloads.push(notification.payload)
  }

  listener.on("notification", onNotification)
  try {
    await operation()
    await writer.query("SELECT pg_notify($1, $2)", [
      dashboardRefreshChannel,
      sentinel,
    ])
    timeout = setTimeout(
      () => fail?.(new Error("Timed out waiting for notification sentinel")),
      2_000
    )
    await completed
    return payloads
  } finally {
    if (timeout) clearTimeout(timeout)
    listener.off("notification", onNotification)
  }
}

async function queueDashboardRefreshRow(
  writer: Client,
  organizationId: string,
  idempotencyKey: string
) {
  await writer.query(
    `
      INSERT INTO derived.refresh_jobs (
        organization_id, queue_key, idempotency_key, status, run_after
      )
      VALUES ($1, 'dashboard', $2, 'pending', now())
      ON CONFLICT (organization_id, queue_key)
        WHERE status IN ('pending', 'running')
      DO UPDATE SET run_after = LEAST(derived.refresh_jobs.run_after, now()),
        updated_at = now(), last_error = NULL
    `,
    [organizationId, idempotencyKey]
  )
}

async function representativeUpgradeFingerprint() {
  const result = await pool.query<{ fingerprint: Record<string, unknown> }>(
    `
      SELECT jsonb_build_object(
        'organizations', (
          SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(source_row)) ORDER BY id)
          FROM core.organizations source_row
          WHERE id = $1
        ),
        'machines', (
          SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(source_row)) ORDER BY id)
          FROM catalog.machines source_row
          WHERE organization_id = $1
        ),
        'customers', (
          SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(source_row)) ORDER BY id)
          FROM sales.customers source_row
          WHERE organization_id = $1
        ),
        'enquiries', (
          SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(source_row)) ORDER BY id)
          FROM sales.enquiries source_row
          WHERE organization_id = $1
        ),
        'candidates', (
          SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(source_row)) ORDER BY id)
          FROM recruitment.candidates source_row
          WHERE organization_id = $1
        )
      ) AS fingerprint
    `,
    [representativeOrganizationId]
  )
  return result.rows[0]!.fingerprint
}

async function resetDisposableDatabase() {
  for (const schema of expectedSchemas) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  }
}

beforeAll(async () => {
  assertDisposableLocalDatabase(connectionString)
  await resetDisposableDatabase()
})

afterAll(async () => {
  await pool.end()
})

test("a representative 0038 database upgrades without changing canonical rows", async () => {
  await migrateDatabase({
    connectionString,
    through: "0038_recruitment_application_cycles.sql",
  })

  const priorHistory = await pool.query<{ checksum: string; name: string }>(`
    SELECT name, checksum
    FROM migration.schema_migrations
    ORDER BY name
  `)
  expect(
    Object.fromEntries(
      priorHistory.rows.map(({ name, checksum }) => [name, checksum])
    )
  ).toEqual(publishedChecksums)

  await pool.query(
    `
      INSERT INTO core.organizations (id, code, name)
      VALUES ($1, 'UPGRADE-0038', 'Representative 0038 upgrade')
    `,
    [representativeOrganizationId]
  )
  await pool.query(
    `
      INSERT INTO manufacturing.production_floors (
        id, organization_id, code, name
      ) VALUES (
        '00000000-0000-4000-8000-000000000039', $1, 'cnc', 'CNC'
      )
    `,
    [representativeOrganizationId]
  )
  await pool.query(
    `
      INSERT INTO catalog.machines (
        id, organization_id, machine_number, name, production_floor_id,
        source_system, source_table, source_id, source_payload
      ) VALUES (
        '00000000-0000-4000-8000-000000000040', $1, 'CNC-0038',
        'Upgrade fixture machine', '00000000-0000-4000-8000-000000000039',
        'mrm-dashboard', 'dataEntries', 'upgrade-machine',
        '{"_id":"upgrade-machine","entryType":"machine_master","payload":{"machineNumber":"CNC-0038","productionFloorCode":"cnc"}}'::jsonb
      )
    `,
    [representativeOrganizationId]
  )
  await pool.query(
    `
      INSERT INTO sales.customers (
        id, organization_id, customer_uid, company_name,
        source_system, source_table, source_id
      ) VALUES (
        '00000000-0000-4000-8000-000000000041', $1, 'UPGRADE-CUSTOMER',
        'Upgrade customer', 'fixture', 'customers', 'upgrade-customer'
      )
    `,
    [representativeOrganizationId]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiries (
        id, organization_id, enquiry_number, customer_id, received_on,
        source_system, source_table, source_id
      ) VALUES (
        '00000000-0000-4000-8000-000000000042', $1, 'UPGRADE-ENQUIRY',
        '00000000-0000-4000-8000-000000000041', DATE '2026-08-08',
        'fixture', 'enquiries', 'upgrade-enquiry'
      )
    `,
    [representativeOrganizationId]
  )
  await pool.query(
    `
      INSERT INTO recruitment.candidates (
        id, organization_id, name, phone,
        source_system, source_table, source_id
      ) VALUES (
        '00000000-0000-4000-8000-000000000043', $1, 'Upgrade Candidate',
        '+910038', 'fixture', 'candidates', 'upgrade-candidate'
      )
    `,
    [representativeOrganizationId]
  )

  const fingerprintBefore = await representativeUpgradeFingerprint()
  await migrateDatabase({ connectionString })
  const fingerprintAfter = await representativeUpgradeFingerprint()
  const preservedHistory = await pool.query<{
    checksum: string
    name: string
  }>(`
    SELECT name, checksum
    FROM migration.schema_migrations
    WHERE name <= '0038_recruitment_application_cycles.sql'
    ORDER BY name
  `)
  const backfill = await pool.query<{
    entry_type: string
    source_group: string
    source_kind: string
    source_payload: Record<string, unknown>
  }>(`
    SELECT source_kind, source_group, entry_type, source_payload
    FROM derived.dashboard_source_records
    WHERE organization_id = '${representativeOrganizationId}'
      AND source_id = 'upgrade-machine'
  `)

  expect(fingerprintAfter).toEqual(fingerprintBefore)
  expect(preservedHistory.rows).toEqual(priorHistory.rows)
  expect(backfill.rows).toEqual([
    {
      entry_type: "machine_master",
      source_group: "dataEntries",
      source_kind: "data_entry",
      source_payload: {
        _id: "upgrade-machine",
        entryType: "machine_master",
        payload: {
          machineNumber: "CNC-0038",
          productionFloorCode: "cnc",
        },
      },
    },
  ])
})

test("dashboard floor migration queues one refresh per organization", async () => {
  const organizationId = "00000000-0000-4000-8000-000000000059"

  await resetDisposableDatabase()
  await migrateDatabase({
    connectionString,
    through: "0058_dashboard_route_master_projection.sql",
  })
  await pool.query(
    `
      INSERT INTO core.organizations (id, code, name)
      VALUES ($1, 'UPGRADE-0059', 'Representative 0059 upgrade')
    `,
    [organizationId]
  )
  await pool.query(
    `
      INSERT INTO derived.dashboard_source_records (
        organization_id, source_schema, source_table, source_id,
        source_kind, source_group, entry_type, changed_at, source_payload
      ) VALUES
        (
          $1, 'coverage_test', 'floor', 'first', 'data_entry',
          'dataEntries', 'machine_master', now(),
          '{"productionUnit":"Production Planning and Control Conventional 02"}'::jsonb
        ),
        (
          $1, 'coverage_test', 'floor', 'second', 'data_entry',
          'dataEntries', 'machine_master', now(),
          '{"productionUnit":"Production Planning and Control Conventional 02"}'::jsonb
        )
    `,
    [organizationId]
  )

  await migrateDatabase({
    connectionString,
    through: "0059_dashboard_conventional_02_projection.sql",
  })

  const projection = await pool.query<{ production_floor_code: string }>(
    `
      SELECT production_floor_code
      FROM derived.dashboard_source_records
      WHERE organization_id = $1
      ORDER BY source_id
    `,
    [organizationId]
  )
  const refreshJobs = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM derived.refresh_jobs
      WHERE organization_id = $1 AND queue_key = 'dashboard'
    `,
    [organizationId]
  )

  expect(projection.rows).toEqual([
    { production_floor_code: "conventional-02" },
    { production_floor_code: "conventional-02" },
  ])
  expect(refreshJobs.rows[0]?.count).toBe("1")
}, 20_000)

test("an empty database migrates into the MRMPL bounded contexts", async () => {
  await resetDisposableDatabase()
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
}, 20_000)

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

test("the first performance foundation follows immutable staging history", async () => {
  await migrateDatabase({ connectionString })

  const migrations = await pool.query<{ name: string }>(`
    SELECT name
    FROM migration.schema_migrations
    WHERE name >= '0032_'
      AND name <= '0039_query_performance_foundation.sql'
    ORDER BY name
  `)

  expect(migrations.rows.map((row) => row.name)).toEqual([
    "0032_runtime_parser_permissions.sql",
    "0033_production_floor_isolation.sql",
    "0034_quality_floor_isolation.sql",
    "0035_recruitment_appointment_statuses.sql",
    "0036_recruitment_post_actions.sql",
    "0037_recruitment_interview_schedule_history.sql",
    "0038_recruitment_application_cycles.sql",
    "0039_query_performance_foundation.sql",
  ])

  const indexes = await pool.query<{ indexname: string }>(`
    SELECT indexname
    FROM pg_indexes
    WHERE indexname = ANY(
      ARRAY[
        'refresh_jobs_pending_claim_idx',
        'production_entries_dashboard_source_idx',
        'shop_floor_events_dashboard_source_idx',
        'hourly_checks_dashboard_source_idx',
        'planner_priority_dashboard_source_idx',
        'plan_override_dashboard_source_idx',
        'route_change_dashboard_source_idx',
        'dispatch_approval_dashboard_source_idx',
        'file_links_batched_target_idx',
        'clarification_tasks_open_queue_idx',
        'quote_items_match_candidates_idx',
        'purchase_orders_timeline_idx',
        'engineering_change_notes_queue_idx',
        'engineering_change_decisions_source_idx',
        'enquiries_timeline_idx',
        'followups_open_queue_idx'
      ]
    )
  `)

  expect(new Set(indexes.rows.map((row) => row.indexname))).toEqual(
    new Set([
      "refresh_jobs_pending_claim_idx",
      "production_entries_dashboard_source_idx",
      "shop_floor_events_dashboard_source_idx",
      "hourly_checks_dashboard_source_idx",
      "planner_priority_dashboard_source_idx",
      "plan_override_dashboard_source_idx",
      "route_change_dashboard_source_idx",
      "dispatch_approval_dashboard_source_idx",
      "file_links_batched_target_idx",
      "clarification_tasks_open_queue_idx",
      "quote_items_match_candidates_idx",
      "purchase_orders_timeline_idx",
      "engineering_change_notes_queue_idx",
      "engineering_change_decisions_source_idx",
      "enquiries_timeline_idx",
      "followups_open_queue_idx",
    ])
  )

  const notificationContract = await pool.query<{
    function_exists: boolean
    trigger_exists: boolean
  }>(`
    SELECT
      to_regprocedure(
        'derived.notify_dashboard_refresh_job()'
      ) IS NOT NULL AS function_exists,
      EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'refresh_jobs_notify_dashboard'
          AND tgrelid = 'derived.refresh_jobs'::regclass
          AND NOT tgisinternal
      ) AS trigger_exists
  `)

  expect(notificationContract.rows).toEqual([
    {
      function_exists: true,
      trigger_exists: true,
    },
  ])
})

test("refresh-job hints are commit-scoped, coalesced, and bounded", async () => {
  await migrateDatabase({ connectionString })
  const listener = new Client({ connectionString })
  const writer = new Client({ connectionString })
  const repository = createDashboardReadModelRepository({ connectionString })
  const suffix = randomUUID().slice(0, 8)
  const committedOrganizationId = randomUUID()
  const rolledBackOrganizationId = randomUUID()
  const expectedPayload = {
    organizationId: committedOrganizationId,
    queueKey: "dashboard",
    v: 1,
  }
  let listenerConnected = false
  let writerConnected = false

  try {
    await listener.connect()
    listenerConnected = true
    await writer.connect()
    writerConnected = true
    await listener.query(`LISTEN ${dashboardRefreshChannel}`)
    await writer.query(
      `
        INSERT INTO core.organizations (id, code, name)
        VALUES ($1, $2, 'Committed notification fixture'),
          ($3, $4, 'Rolled-back notification fixture')
      `,
      [
        committedOrganizationId,
        `NOTIFY-COMMIT-${suffix}`,
        rolledBackOrganizationId,
        `NOTIFY-ROLLBACK-${suffix}`,
      ]
    )

    const committed = await captureNotificationsBeforeSentinel(
      listener,
      writer,
      async () => {
        await repository.requestRefresh(committedOrganizationId)
      }
    )
    const committedEffects = await writer.query<{
      jobs: string
      outbox_events: string
    }>(
      `
        SELECT
          (SELECT count(*)::text FROM derived.refresh_jobs
            WHERE organization_id = $1 AND queue_key = 'dashboard') AS jobs,
          (SELECT count(*)::text FROM derived.outbox_events
            WHERE organization_id = $1
              AND topic = 'dashboard.refresh.requested') AS outbox_events
      `,
      [committedOrganizationId]
    )

    expect(committed).toHaveLength(1)
    expect(JSON.parse(committed[0]!)).toEqual(expectedPayload)
    expect(Buffer.byteLength(committed[0]!, "utf8")).toBeLessThan(1_024)
    expect(committedEffects.rows).toEqual([{ jobs: "1", outbox_events: "1" }])

    const rollbackConstraint = "refresh_notification_test_reject_outbox"
    await writer.query(`
      ALTER TABLE derived.outbox_events
      ADD CONSTRAINT ${rollbackConstraint}
      CHECK (
        organization_id <> '${rolledBackOrganizationId}'::uuid
      ) NOT VALID
    `)

    let rolledBack: string[]
    try {
      rolledBack = await captureNotificationsBeforeSentinel(
        listener,
        writer,
        async () => {
          await expect(
            repository.requestRefresh(rolledBackOrganizationId)
          ).rejects.toThrow(rollbackConstraint)
        }
      )
    } finally {
      await writer.query(`
        ALTER TABLE derived.outbox_events
        DROP CONSTRAINT ${rollbackConstraint}
      `)
    }

    expect(rolledBack).toEqual([])
    const rolledBackEffects = await writer.query<{
      jobs: string
      outbox_events: string
    }>(
      `
        SELECT
          (SELECT count(*)::text FROM derived.refresh_jobs
            WHERE organization_id = $1) AS jobs,
          (SELECT count(*)::text FROM derived.outbox_events
            WHERE organization_id = $1) AS outbox_events
      `,
      [rolledBackOrganizationId]
    )
    expect(rolledBackEffects.rows).toEqual([{ jobs: "0", outbox_events: "0" }])

    const coalesced = await captureNotificationsBeforeSentinel(
      listener,
      writer,
      async () => {
        await writer.query("BEGIN")
        await queueDashboardRefreshRow(
          writer,
          committedOrganizationId,
          `notify-coalesced-one-${suffix}`
        )
        await queueDashboardRefreshRow(
          writer,
          committedOrganizationId,
          `notify-coalesced-two-${suffix}`
        )
        await writer.query("COMMIT")
      }
    )

    expect(coalesced).toHaveLength(1)
    expect(JSON.parse(coalesced[0]!)).toEqual(expectedPayload)

    const duplicate = await captureNotificationsBeforeSentinel(
      listener,
      writer,
      async () => {
        await repository.requestRefresh(committedOrganizationId)
      }
    )
    const duplicateEffects = await writer.query<{
      jobs: string
      outbox_events: string
    }>(
      `
        SELECT
          (SELECT count(*)::text FROM derived.refresh_jobs
            WHERE organization_id = $1 AND queue_key = 'dashboard') AS jobs,
          (SELECT count(*)::text FROM derived.outbox_events
            WHERE organization_id = $1
              AND topic = 'dashboard.refresh.requested') AS outbox_events
      `,
      [committedOrganizationId]
    )

    expect(duplicate).toHaveLength(0)
    expect(duplicateEffects.rows).toEqual([{ jobs: "1", outbox_events: "1" }])
  } finally {
    if (listenerConnected) {
      await listener
        .query(`UNLISTEN ${dashboardRefreshChannel}`)
        .catch(() => {})
      await listener.end()
    }
    if (writerConnected) await writer.end()
    await repository.close()
  }
})

test("local PostgreSQL exposes query and IO observability", async () => {
  await migrateDatabase({ connectionString })

  const migration = await pool.query<{ applied: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM migration.schema_migrations
      WHERE name = '0040_query_observability.sql'
    ) AS applied
  `)
  expect(migration.rows[0]?.applied).toBe(true)

  const observability = await pool.query<{
    extension_installed: boolean
    io_timing: string
    preload_libraries: string
    statement_tracking: string | null
  }>(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) AS extension_installed,
      current_setting('track_io_timing') AS io_timing,
      current_setting('shared_preload_libraries') AS preload_libraries,
      current_setting('pg_stat_statements.track', true) AS statement_tracking
  `)

  expect(observability.rows[0]).toEqual({
    extension_installed: true,
    io_timing: "on",
    preload_libraries: "pg_stat_statements",
    statement_tracking: "all",
  })

  const statements = await pool.query<{ statements: string }>(
    "SELECT count(*)::text AS statements FROM pg_stat_statements"
  )
  expect(Number(statements.rows[0]?.statements)).toBeGreaterThanOrEqual(0)
})

test("dashboard source projection preserves floor-specific payloads transactionally", async () => {
  await migrateDatabase({ connectionString })

  const organization = await pool.query<{ id: string }>(`
    INSERT INTO core.organizations (code, name)
    VALUES ('PERF-CONTRACT', 'Performance Contract')
    ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `)
  const organizationId = organization.rows[0]!.id
  const floor = await pool.query<{ id: string }>(
    `
      INSERT INTO manufacturing.production_floors (
        organization_id, code, name
      ) VALUES ($1, 'cnc', 'CNC Production Floor')
      ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
    [organizationId]
  )
  const initialPayload = {
    _id: "projection-machine",
    entryType: "machine_master",
    payload: { machineNumber: "CNC-900", productionFloorCode: "cnc" },
    productionFloorCode: "cnc",
  }

  await pool.query(
    `
      INSERT INTO catalog.machines (
        organization_id, machine_number, name, production_floor_id,
        source_system, source_table, source_id, source_payload
      ) VALUES ($1, 'CNC-900', 'Projection machine', $2,
        'mrm-dashboard', 'dataEntries', 'projection-machine', $3::jsonb)
    `,
    [organizationId, floor.rows[0]!.id, JSON.stringify(initialPayload)]
  )

  const inserted = await pool.query<{
    entry_type: string
    production_floor_code: string
    source_group: string
    source_kind: string
    source_payload: typeof initialPayload
  }>(
    `
      SELECT source_kind, source_group, entry_type, production_floor_code,
        source_payload
      FROM derived.dashboard_source_records
      WHERE organization_id = $1 AND source_id = 'projection-machine'
    `,
    [organizationId]
  )

  const updatedPayload = {
    ...initialPayload,
    productionFloorCode: "conventional-02",
    payload: {
      machineNumber: "CNC-901",
      productionFloorCode: "conventional-02",
    },
  }
  await pool.query(
    `
      UPDATE catalog.machines
      SET machine_number = 'CNC-901', source_payload = $2::jsonb
      WHERE organization_id = $1 AND source_id = 'projection-machine'
    `,
    [organizationId, JSON.stringify(updatedPayload)]
  )
  const updated = await pool.query<{
    production_floor_code: string
    source_payload: typeof updatedPayload
  }>(
    `
      SELECT production_floor_code, source_payload
      FROM derived.dashboard_source_records
      WHERE organization_id = $1 AND source_id = 'projection-machine'
    `,
    [organizationId]
  )

  await pool.query(
    `
      DELETE FROM catalog.machines
      WHERE organization_id = $1 AND source_id = 'projection-machine'
    `,
    [organizationId]
  )
  const remaining = await pool.query<{ rows: string }>(
    `
      SELECT count(*)::text AS rows
      FROM derived.dashboard_source_records
      WHERE organization_id = $1 AND source_id = 'projection-machine'
    `,
    [organizationId]
  )
  const topology = await pool.query<{
    indexes: string
    projection_trigger: string
    triggers: string
  }>(`
    SELECT
      (
        SELECT count(*)::text
        FROM pg_indexes
        WHERE schemaname = 'derived'
          AND indexname IN (
            'dashboard_source_records_entry_floor_read_idx',
            'dashboard_source_records_group_floor_read_idx',
            'dashboard_source_records_correction_floor_read_idx'
          )
      ) AS indexes,
      (
        SELECT count(*)::text
        FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname = 'set_dashboard_source_floor_code'
      ) AS projection_trigger,
      (
        SELECT count(*)::text
        FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname LIKE 'sync_dashboard_source_%'
      ) AS triggers
  `)

  expect({
    inserted: inserted.rows[0],
    remaining: remaining.rows[0]?.rows,
    topology: topology.rows[0],
    updated: updated.rows[0],
  }).toEqual({
    inserted: {
      entry_type: "machine_master",
      production_floor_code: "cnc",
      source_group: "dataEntries",
      source_kind: "data_entry",
      source_payload: initialPayload,
    },
    remaining: "0",
    topology: { indexes: "3", projection_trigger: "1", triggers: "33" },
    updated: {
      production_floor_code: "conventional-02",
      source_payload: updatedPayload,
    },
  })
})

test("dashboard source projection indexes every bounded category and floor", async () => {
  await migrateDatabase({ connectionString })

  const indexes = await pool.query<{ indexname: string }>(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'derived'
      AND indexname IN (
        'dashboard_source_records_correction_floor_read_idx',
        'dashboard_source_records_entry_floor_read_idx',
        'dashboard_source_records_group_floor_read_idx'
      )
    ORDER BY indexname
  `)

  expect(indexes.rows.map((row) => row.indexname)).toEqual([
    "dashboard_source_records_correction_floor_read_idx",
    "dashboard_source_records_entry_floor_read_idx",
    "dashboard_source_records_group_floor_read_idx",
  ])
})

test("commercial contains-search and operational filters are indexed", async () => {
  await migrateDatabase({ connectionString })

  const extension = await pool.query<{ installed: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
    ) AS installed
  `)
  const indexes = await pool.query<{ indexname: string }>(`
    SELECT indexname
    FROM pg_indexes
    WHERE indexname = ANY(
      ARRAY[
        'drawings_commercial_search_trgm_idx',
        'drawings_operational_filter_idx',
        'items_commercial_search_trgm_idx',
        'quote_items_commercial_search_trgm_idx',
        'quote_items_customer_part_exact_idx',
        'quote_items_quote_number_exact_idx',
        'website_profiles_commercial_search_trgm_idx',
        'website_profiles_operational_filter_idx'
      ]
    )
    ORDER BY indexname
  `)

  expect({
    indexes: indexes.rows.map((row) => row.indexname),
    trigrams: extension.rows[0]?.installed,
  }).toEqual({
    indexes: [
      "drawings_commercial_search_trgm_idx",
      "drawings_operational_filter_idx",
      "items_commercial_search_trgm_idx",
      "quote_items_commercial_search_trgm_idx",
      "quote_items_customer_part_exact_idx",
      "quote_items_quote_number_exact_idx",
      "website_profiles_commercial_search_trgm_idx",
      "website_profiles_operational_filter_idx",
    ],
    trigrams: true,
  })
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
    web_can_delete_candidate_event: boolean
    web_can_delete_candidate_events: boolean
    web_can_delete_candidate_departments: boolean
    web_can_delete_customers: boolean
    web_can_execute_try_date: boolean
    web_can_execute_try_timestamptz: boolean
    web_can_migrate: boolean
    web_can_read_migration_evidence: boolean
    web_can_replace_candidate_department: boolean
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
      has_table_privilege(
        'mrmpl_web',
        'recruitment.candidate_departments',
        'DELETE'
      ) AS web_can_delete_candidate_departments,
      has_table_privilege(
        'mrmpl_web',
        'recruitment.candidate_events',
        'DELETE'
      ) AS web_can_delete_candidate_events,
      has_function_privilege(
        'mrmpl_web',
        'recruitment.delete_candidate_event(uuid, uuid)',
        'EXECUTE'
      ) AS web_can_delete_candidate_event,
      has_function_privilege(
        'mrmpl_web',
        'recruitment.replace_candidate_department(uuid, uuid, uuid)',
        'EXECUTE'
      ) AS web_can_replace_candidate_department,
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
    web_can_delete_candidate_event: true,
    web_can_delete_candidate_events: false,
    web_can_delete_candidate_departments: false,
    web_can_delete_customers: false,
    web_can_execute_try_date: true,
    web_can_execute_try_timestamptz: true,
    web_can_migrate: false,
    web_can_read_migration_evidence: false,
    web_can_replace_candidate_department: true,
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
    "employee_links",
    "permissions",
    "post_role_assignments",
    "rate_limits",
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

test("authorization seeds every unified application module and correction authority", async () => {
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

  const correctionCapability = await pool.query<{ administrator: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM identity.permissions AS permissions
      JOIN identity.role_permissions AS role_permissions
        ON role_permissions.permission_id = permissions.id
      JOIN identity.roles AS roles ON roles.id = role_permissions.role_id
      WHERE permissions.key = 'operations.corrections.write'
        AND roles.key = 'administrator'
    ) AS administrator
  `)
  expect(correctionCapability.rows[0]?.administrator).toBe(true)
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
    "derived.dashboard_source_records",
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
