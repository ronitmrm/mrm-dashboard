import { performance } from "node:perf_hooks"
import { randomUUID } from "node:crypto"

import {
  createTelemetryBenchmarkHarness,
  createTelemetryRuntime,
  withPerformanceOperation,
} from "@workspace/observability"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { migrateDatabase } from "./migrate"
import { instrumentPostgresPool } from "./postgres-telemetry"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = instrumentPostgresPool(new Pool({ connectionString }))
const controlledLatencyGate = process.env.CONTROLLED_SEARCH_GATE === "1"
let ownsDisposableDatabase = false
const disposableSchemas = [
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

async function withControlledSearchTelemetry<Result>(
  operation: string,
  execute: () => Promise<Result>
) {
  if (!controlledLatencyGate) return execute()
  const benchmark = createTelemetryBenchmarkHarness(["performance.operation"])
  const result = await withPerformanceOperation(
    {
      commandId: "controlled-search",
      operation,
      runtime: createTelemetryRuntime({
        artifactCommit: "controlled-search-local",
        environment: "test",
      }),
      sink: benchmark.sink,
      subsystem: "commercial",
    },
    execute
  )
  const events = benchmark.assertComplete()
  const operationEvent = events.find(
    (event) => event.event === "performance.operation"
  )
  expect(operationEvent).toEqual(
    expect.objectContaining({ statements: expect.any(Number) })
  )
  if (operationEvent?.event === "performance.operation") {
    expect(operationEvent.statements).toBeGreaterThan(0)
    expect(operationEvent.postgresBytes.request).toBeGreaterThan(0)
    expect(operationEvent.postgresBytes.response).toBeGreaterThan(0)
  }
  return result
}
const candidateSearchSql = `
  SELECT quote.id
  FROM sales.quote_items quote
  WHERE quote.organization_id = $1
    AND quote.customer_id = $2
    AND quote.status IN ('Draft', 'Sent', 'Accepted', 'Ordered')
    AND lower(
      btrim(coalesce(quote.customer_part_code, '')) || ' ' ||
      btrim(quote.quote_number)
    ) LIKE $3
  ORDER BY quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
    quote.id DESC
  LIMIT 51
`
const customerPartExactSql = `
  SELECT quote.id
  FROM sales.quote_items quote
  WHERE quote.organization_id = $1
    AND quote.customer_id = $2
    AND quote.status IN ('Draft', 'Sent', 'Accepted', 'Ordered')
    AND lower(btrim(coalesce(quote.customer_part_code, ''))) = $3
  ORDER BY quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
    quote.id DESC
  LIMIT 51
`
const quoteNumberExactSql = `
  SELECT quote.id
  FROM sales.quote_items quote
  WHERE quote.organization_id = $1
    AND quote.customer_id = $2
    AND quote.status IN ('Draft', 'Sent', 'Accepted', 'Ordered')
    AND lower(btrim(quote.quote_number)) = $3
  ORDER BY quote.sent_at DESC NULLS LAST, quote.updated_at DESC,
    quote.id DESC
  LIMIT 51
`
const itemSearchSql = `
  SELECT item.id
  FROM catalog.items item
  WHERE item.organization_id = $1
    AND lower(
      coalesce(item.uid, '') || ' ' || coalesce(item.description, '')
    ) LIKE $2
  ORDER BY item.uid, item.id
  LIMIT 51
`
const drawingSearchSql = `
  SELECT drawing.id
  FROM catalog.drawings drawing
  WHERE drawing.organization_id = $1
    AND lower(
      coalesce(drawing.drawing_number, '') || ' ' ||
      coalesce(drawing.remarks, '')
    ) LIKE $2
  ORDER BY drawing.created_at DESC, drawing.id DESC
  LIMIT 51
`
const drawingRevisionSql = `
  SELECT drawing.id
  FROM catalog.drawings drawing
  WHERE drawing.organization_id = $1 AND drawing.revision = $2
  ORDER BY drawing.created_at DESC, drawing.id DESC
  LIMIT 51
`
const websiteSearchSql = `
  SELECT profile.id
  FROM catalog.website_product_profiles profile
  WHERE profile.organization_id = $1
    AND lower(
      coalesce(profile.part_code, '') || ' ' ||
      coalesce(profile.product_description, '') || ' ' ||
      coalesce(profile.category, '') || ' ' ||
      coalesce(profile.sub_category, '') || ' ' ||
      coalesce(profile.grade, '')
    ) LIKE $2
  ORDER BY profile.id
  LIMIT 51
`
const websiteCategorySql = `
  SELECT profile.id
  FROM catalog.website_product_profiles profile
  WHERE profile.organization_id = $1
    AND profile.is_active = true
    AND profile.website_status = 'Completed'
    AND profile.category = $2
  ORDER BY profile.id
  LIMIT 51
`

type ExplainNode = {
  "Index Name"?: string
  "Node Type": string
  "Relation Name"?: string
  "Temp Read Blocks"?: number
  "Temp Written Blocks"?: number
  Plans?: ExplainNode[]
}

type ExplainResult = {
  Plan: ExplainNode
}

function planNodes(root: ExplainNode): ExplainNode[] {
  return [root, ...(root.Plans ?? []).flatMap(planNodes)]
}

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
      "commercial-search-indexes.integration.test.ts is destructive and only runs against a loopback database whose name contains 'test'."
    )
  }
}

async function resetDisposableDatabase() {
  for (const schema of disposableSchemas) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  }
}

async function expectIndexedPlanAndP95({
  expectedIndexes,
  label,
  parameters,
  relation,
  sql,
}: {
  expectedIndexes: readonly string[]
  label: string
  parameters: readonly unknown[]
  relation: string
  sql: string
}) {
  const explained = await pool.query<{ "QUERY PLAN": ExplainResult[] }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    [...parameters]
  )
  const root = explained.rows[0]!["QUERY PLAN"][0]!.Plan
  const nodes = planNodes(root)
  const usedIndexes = new Set(
    nodes.flatMap((node) => (node["Index Name"] ? [node["Index Name"]] : []))
  )

  for (const indexName of expectedIndexes) {
    expect(usedIndexes.has(indexName), JSON.stringify(explained.rows[0])).toBe(
      true
    )
  }
  expect(
    nodes.some(
      (node) =>
        node["Node Type"] === "Seq Scan" && node["Relation Name"] === relation
    )
  ).toBe(false)
  expect(
    nodes.every(
      (node) =>
        (node["Temp Read Blocks"] ?? 0) === 0 &&
        (node["Temp Written Blocks"] ?? 0) === 0
    )
  ).toBe(true)

  if (!controlledLatencyGate) return

  for (let sample = 0; sample < 5; sample += 1) {
    await pool.query(sql, [...parameters])
  }
  const measuredMs: number[] = []
  for (let sample = 0; sample < 30; sample += 1) {
    const startedAt = performance.now()
    const result = await pool.query(sql, [...parameters])
    measuredMs.push(performance.now() - startedAt)
    expect(result.rowCount).toBeGreaterThan(0)
  }
  measuredMs.sort((left, right) => left - right)
  const p95 = measuredMs[Math.ceil(measuredMs.length * 0.95) - 1]!
  expect(p95, `${label} p95 was ${p95.toFixed(2)} ms`).toBeLessThanOrEqual(25)
}

beforeAll(async () => {
  assertDisposableLocalDatabase(connectionString)
  ownsDisposableDatabase = true
  await resetDisposableDatabase()
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  if (ownsDisposableDatabase) await resetDisposableDatabase()
  await pool.end()
})

test(
  "10,000-row Sales candidate search uses bounded trigram plans",
  async () =>
    withControlledSearchTelemetry("sales.candidate_search", async () => {
      const expectedIndexes = [
        "quote_items_commercial_search_trgm_idx",
        "quote_items_customer_part_exact_idx",
        "quote_items_quote_number_exact_idx",
      ]
      const indexes = await pool.query<{ indexname: string }>(
        `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'sales' AND indexname = ANY($1::text[])
      ORDER BY indexname
    `,
        [expectedIndexes]
      )

      expect(indexes.rows.map((row) => row.indexname)).toEqual(expectedIndexes)

      const suffix = randomUUID().slice(0, 8)
      const needle = `needle-${suffix}`
      const organizations = await pool.query<{ code: string; id: string }>(
        `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'Candidate index benchmark'),
        ($2, 'Candidate index decoy')
      RETURNING id, code
    `,
        [`CANDIDATE-IDX-${suffix}`, `CANDIDATE-DECOY-${suffix}`]
      )
      const organizationByCode = new Map(
        organizations.rows.map((row) => [row.code, row.id])
      )
      const organizationId = organizationByCode.get(`CANDIDATE-IDX-${suffix}`)!
      const decoyOrganizationId = organizationByCode.get(
        `CANDIDATE-DECOY-${suffix}`
      )!
      const customers = await pool.query<{ customer_uid: string; id: string }>(
        `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name,
        source_system, source_table, source_id
      )
      VALUES
        ($1, $3, 'Candidate index customer', 'test', 'customers', $3),
        ($1, $4, 'Candidate index other customer', 'test', 'customers', $4),
        ($2, $5, 'Candidate index decoy customer', 'test', 'customers', $5)
      RETURNING id, customer_uid
    `,
        [
          organizationId,
          decoyOrganizationId,
          `CANDIDATE-CUSTOMER-${suffix}`,
          `CANDIDATE-OTHER-CUSTOMER-${suffix}`,
          `CANDIDATE-DECOY-CUSTOMER-${suffix}`,
        ]
      )
      const customerByUid = new Map(
        customers.rows.map((row) => [row.customer_uid, row.id])
      )
      const customerId = customerByUid.get(`CANDIDATE-CUSTOMER-${suffix}`)!
      const otherCustomerId = customerByUid.get(
        `CANDIDATE-OTHER-CUSTOMER-${suffix}`
      )!
      const decoyCustomerId = customerByUid.get(
        `CANDIDATE-DECOY-CUSTOMER-${suffix}`
      )!
      const items = await pool.query<{ id: string; uid: string }>(
        `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      )
      VALUES
        ($1, $3, 'INTERNAL', 'P', 'Candidate index product',
          'test', 'items', $3),
        ($2, $4, 'INTERNAL', 'P', 'Candidate index decoy product',
          'test', 'items', $4)
      RETURNING id, uid
    `,
        [
          organizationId,
          decoyOrganizationId,
          `CANDIDATE-ITEM-${suffix}`,
          `CANDIDATE-DECOY-ITEM-${suffix}`,
        ]
      )
      const itemByUid = new Map(items.rows.map((row) => [row.uid, row.id]))
      const itemId = itemByUid.get(`CANDIDATE-ITEM-${suffix}`)!
      const decoyItemId = itemByUid.get(`CANDIDATE-DECOY-ITEM-${suffix}`)!

      await pool.query(
        `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, customer_id, item_id,
        lineage_item_id, customer_part_code, unit_price, status, sent_at,
        updated_at, source_system, source_table, source_id, source_payload
      )
      SELECT
        CASE WHEN generated.ordinal <= 7500 THEN $1::uuid ELSE $5::uuid END,
        CASE WHEN generated.ordinal % 991 = 0
          THEN $9 || '-quote-' || generated.ordinal::text
          ELSE $4 || '-quote-' || generated.ordinal::text
        END,
        1,
        CASE
          WHEN generated.ordinal <= 5000 THEN $2::uuid
          WHEN generated.ordinal <= 7500 THEN $6::uuid
          ELSE $7::uuid
        END,
        CASE WHEN generated.ordinal <= 7500 THEN $3::uuid ELSE $8::uuid END,
        CASE WHEN generated.ordinal <= 7500 THEN $3::uuid ELSE $8::uuid END,
        CASE WHEN generated.ordinal % 997 = 0
          THEN $9 || '-part-' || generated.ordinal::text
          ELSE 'customer-part-' || generated.ordinal::text
        END,
        generated.ordinal::numeric,
        CASE
          WHEN generated.ordinal % 5 = 0 THEN 'Superseded'
          WHEN generated.ordinal % 3 = 0 THEN 'Draft'
          WHEN generated.ordinal % 3 = 1 THEN 'Sent'
          ELSE 'Accepted'
        END,
        timestamptz '2026-01-01 00:00:00+00'
          + generated.ordinal * interval '1 second',
        timestamptz '2026-01-01 00:00:00+00'
          + generated.ordinal * interval '1 second',
        'test', 'quote_items',
        $4 || '-quote-' || generated.ordinal::text,
        jsonb_build_object(
          'fixture', repeat('x', 1024),
          'ordinal', generated.ordinal
        )
      FROM generate_series(1, 10000) AS generated(ordinal)
    `,
        [
          organizationId,
          customerId,
          itemId,
          suffix,
          decoyOrganizationId,
          otherCustomerId,
          decoyCustomerId,
          decoyItemId,
          needle,
        ]
      )
      await pool.query("VACUUM (ANALYZE) sales.quote_items")

      const liveRows = await pool.query<{ count: string }>(
        `
      SELECT count(*)::text AS count
      FROM sales.quote_items
      WHERE organization_id = ANY($1::uuid[])
    `,
        [[organizationId, decoyOrganizationId]]
      )
      expect(liveRows.rows[0]?.count).toBe("10000")

      await expectIndexedPlanAndP95({
        expectedIndexes: ["quote_items_commercial_search_trgm_idx"],
        label: "Sales candidate contains search",
        parameters: [organizationId, customerId, `%${needle}%`],
        relation: "quote_items",
        sql: candidateSearchSql,
      })
      await expectIndexedPlanAndP95({
        expectedIndexes: ["quote_items_customer_part_exact_idx"],
        label: "Sales candidate customer-part exact search",
        parameters: [organizationId, customerId, `${needle}-part-997`],
        relation: "quote_items",
        sql: customerPartExactSql,
      })
      await expectIndexedPlanAndP95({
        expectedIndexes: ["quote_items_quote_number_exact_idx"],
        label: "Sales candidate quote-number exact search",
        parameters: [organizationId, customerId, `${needle}-quote-991`],
        relation: "quote_items",
        sql: quoteNumberExactSql,
      })
    }),
  30_000
)

test(
  "10,000-row catalog searches retain their declared access paths",
  async () =>
    withControlledSearchTelemetry("catalog.commercial_search", async () => {
      const expectedIndexes = [
        "drawings_commercial_search_trgm_idx",
        "drawings_operational_filter_idx",
        "items_commercial_search_trgm_idx",
        "website_profiles_commercial_search_trgm_idx",
        "website_profiles_operational_filter_idx",
      ]
      const indexes = await pool.query<{ indexname: string }>(
        `
      SELECT indexname
      FROM pg_indexes
      WHERE indexname = ANY($1::text[])
      ORDER BY indexname
    `,
        [expectedIndexes]
      )
      expect(indexes.rows.map((row) => row.indexname)).toEqual(expectedIndexes)

      const suffix = randomUUID().slice(0, 8)
      const needle = `needle-${suffix}`
      const organizations = await pool.query<{ code: string; id: string }>(
        `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'Catalog index benchmark'),
        ($2, 'Catalog index decoy')
      RETURNING id, code
    `,
        [`CATALOG-IDX-${suffix}`, `CATALOG-DECOY-${suffix}`]
      )
      const organizationByCode = new Map(
        organizations.rows.map((row) => [row.code, row.id])
      )
      const organizationId = organizationByCode.get(`CATALOG-IDX-${suffix}`)!
      const decoyOrganizationId = organizationByCode.get(
        `CATALOG-DECOY-${suffix}`
      )!

      await pool.query(
        `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id, source_payload
      )
      SELECT CASE
          WHEN generated.ordinal <= 7500 THEN $1::uuid ELSE $2::uuid
        END,
        CASE WHEN generated.ordinal % 991 = 0
          THEN $4 || '-item-' || generated.ordinal::text
          ELSE $3 || '-item-' || generated.ordinal::text
        END,
        'INTERNAL', 'P',
        CASE WHEN generated.ordinal % 997 = 0
          THEN $4 || ' product description ' || generated.ordinal::text
          ELSE 'Catalog benchmark product ' || generated.ordinal::text
        END,
        'test', 'items', $3 || '-item-' || generated.ordinal::text,
        jsonb_build_object(
          'fixture', repeat('x', 1024),
          'ordinal', generated.ordinal
        )
      FROM generate_series(1, 10000) AS generated(ordinal)
    `,
        [organizationId, decoyOrganizationId, suffix, needle]
      )
      await pool.query(
        `
      INSERT INTO catalog.drawings (
        organization_id, item_id, revision, drawing_number, remarks,
        source_system, source_table, source_id, source_payload
      )
      SELECT item.organization_id, item.id,
        CASE WHEN lower(item.uid) LIKE $2
          THEN $3 ELSE 'R1'
        END,
        CASE WHEN lower(item.uid) LIKE $2
          THEN $3 || '-drawing-' || item.id::text
          ELSE $1 || '-drawing-' || item.id::text
        END,
        item.description,
        'test', 'drawings', $1 || '-drawing-' || item.id::text,
        jsonb_build_object('fixture', repeat('x', 1024))
      FROM catalog.items item
      WHERE item.organization_id = ANY($4::uuid[])
    `,
        [suffix, `${needle}%`, needle, [organizationId, decoyOrganizationId]]
      )
      await pool.query(
        `
      INSERT INTO catalog.website_product_profiles (
        organization_id, item_id, title, part_code, product_description,
        category, sub_category, grade, is_active, website_status,
        source_system, source_table, source_id, source_payload
      )
      SELECT item.organization_id, item.id, item.uid, item.uid,
        item.description,
        CASE WHEN lower(item.uid) LIKE $2 THEN $3 ELSE 'Benchmark' END,
        'Products', 'Benchmark Grade', true, 'Completed',
        'test', 'website_product_profiles',
        $1 || '-website-' || item.id::text,
        jsonb_build_object('fixture', repeat('x', 1024))
      FROM catalog.items item
      WHERE item.organization_id = ANY($4::uuid[])
    `,
        [
          suffix,
          `${needle}%`,
          `${needle}-category`,
          [organizationId, decoyOrganizationId],
        ]
      )
      await pool.query("VACUUM (ANALYZE) catalog.items")
      await pool.query("VACUUM (ANALYZE) catalog.drawings")
      await pool.query("VACUUM (ANALYZE) catalog.website_product_profiles")

      const fixtureRows = await pool.query<{
        drawings: string
        items: string
        website_profiles: string
      }>(
        `
      SELECT
        (SELECT count(*)::text FROM catalog.items
          WHERE organization_id = ANY($1::uuid[])) AS items,
        (SELECT count(*)::text FROM catalog.drawings
          WHERE organization_id = ANY($1::uuid[])) AS drawings,
        (SELECT count(*)::text FROM catalog.website_product_profiles
          WHERE organization_id = ANY($1::uuid[])) AS website_profiles
    `,
        [[organizationId, decoyOrganizationId]]
      )
      expect(fixtureRows.rows).toEqual([
        { drawings: "10000", items: "10000", website_profiles: "10000" },
      ])

      await expectIndexedPlanAndP95({
        expectedIndexes: ["items_commercial_search_trgm_idx"],
        label: "Item contains search",
        parameters: [organizationId, `%${needle}%`],
        relation: "items",
        sql: itemSearchSql,
      })
      await expectIndexedPlanAndP95({
        expectedIndexes: ["drawings_commercial_search_trgm_idx"],
        label: "Drawing contains search",
        parameters: [organizationId, `%${needle}%`],
        relation: "drawings",
        sql: drawingSearchSql,
      })
      await expectIndexedPlanAndP95({
        expectedIndexes: ["drawings_operational_filter_idx"],
        label: "Drawing revision filter",
        parameters: [organizationId, needle],
        relation: "drawings",
        sql: drawingRevisionSql,
      })
      await expectIndexedPlanAndP95({
        expectedIndexes: ["website_profiles_commercial_search_trgm_idx"],
        label: "Website product contains search",
        parameters: [organizationId, `%${needle}%`],
        relation: "website_product_profiles",
        sql: websiteSearchSql,
      })
      await expectIndexedPlanAndP95({
        expectedIndexes: ["website_profiles_operational_filter_idx"],
        label: "Website product category filter",
        parameters: [organizationId, `${needle}-category`],
        relation: "website_product_profiles",
        sql: websiteCategorySql,
      })
    }),
  60_000
)
