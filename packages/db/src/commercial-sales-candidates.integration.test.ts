import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createCommercialWorkflowRepository } from "./commercial-workflow"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialWorkflowRepository({ connectionString })

let enquiryItemIds: string[]
let oldestEligibleQuoteId: string
let organizationCode: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID().slice(0, 8)
  organizationCode = `SALE-CAND-${suffix}`
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $1)
      RETURNING id
    `,
    [organizationCode]
  )
  const organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, 'Candidate customer', 'test',
        'commercial_sales_candidates', $3)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`, randomUUID()]
  )
  const product = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'INTERNAL', 'P', 'Candidate needle product',
        'test', 'commercial_sales_candidates', $3)
      RETURNING id
    `,
    [organizationId, `PRODUCT-${suffix}`, randomUUID()]
  )
  const enquiry = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, $3, DATE '2026-01-01', 'test',
        'commercial_sales_candidates', $4)
      RETURNING id
    `,
    [organizationId, `ENQ-${suffix}`, customer.rows[0]!.id, randomUUID()]
  )
  const items = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, source_system, source_table, source_id
      )
      SELECT $1, $2, value, 'EXACT-PART',
        'Candidate request ' || value::text, 1, 'test',
        'commercial_sales_candidates', $3 || ':item:' || value::text
      FROM generate_series(1, 2) value
      ORDER BY value
      RETURNING id
    `,
    [organizationId, enquiry.rows[0]!.id, randomUUID()]
  )
  enquiryItemIds = items.rows.map((row) => row.id)

  const quotes = await pool.query<{ id: string; quote_number: string }>(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, enquiry_id,
        enquiry_item_id, customer_id, item_id, lineage_item_id,
        customer_part_code, quantity, unit_price, currency_code, status,
        is_active, sent_at, updated_at, source_system, source_table, source_id
      )
      SELECT $1, 'QUOTE-' || lpad(value::text, 3, '0'), 1, $2, NULL,
        $3, $4, $4,
        CASE WHEN value <= 2 THEN 'EXACT-PART'
          ELSE 'OTHER-' || lpad(value::text, 3, '0') END,
        1, value, 'USD', 'Sent', false,
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute',
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute',
        'test', 'commercial_sales_candidates',
        $5 || ':quote:' || value::text
      FROM generate_series(1, 52) value
      RETURNING id, quote_number
    `,
    [
      organizationId,
      enquiry.rows[0]!.id,
      customer.rows[0]!.id,
      product.rows[0]!.id,
      randomUUID(),
    ]
  )
  oldestEligibleQuoteId = quotes.rows.find(
    (row) => row.quote_number === "QUOTE-003"
  )!.id
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("bounded Sales match candidates", () => {
  test("keeps single and batched exact-part/recency rank identical", async () => {
    const single = await repository.listSalesMatchCandidates(enquiryItemIds[0]!)
    const batched =
      await repository.listSalesMatchCandidatesForItems(enquiryItemIds)
    const bounded =
      await repository.listSalesMatchCandidatesForItemsBounded(enquiryItemIds)

    expect(single.map((row) => row.quoteItemId)).toEqual(
      batched.get(enquiryItemIds[0]!)?.map((row) => row.quoteItemId)
    )
    expect(single.map((row) => row.quoteItemId)).toEqual(
      bounded.get(enquiryItemIds[0]!)?.rows.map((row) => row.quoteItemId)
    )
    expect(single.slice(0, 2).map((row) => row.quoteNumber)).toEqual([
      "QUOTE-002",
      "QUOTE-001",
    ])
    expect(single[2]?.quoteNumber).toBe("QUOTE-052")
    for (const enquiryItemId of enquiryItemIds) {
      expect(bounded.get(enquiryItemId)?.coverage).toEqual({
        limit: 50,
        returned: 50,
        truncated: true,
      })
    }
  })

  test("keeps old eligible quotes selectable through server search", async () => {
    const oldQuote = await repository.searchSalesMatchCandidates(
      enquiryItemIds[0]!,
      "quote-003"
    )
    expect(oldQuote.coverage).toEqual({
      limit: 50,
      returned: 1,
      truncated: false,
    })
    expect(oldQuote.rows[0]?.quoteItemId).toBe(oldestEligibleQuoteId)

    const exactCap = await repository.searchSalesMatchCandidates(
      enquiryItemIds[0]!,
      "other"
    )
    expect(exactCap.coverage).toEqual({
      limit: 50,
      returned: 50,
      truncated: false,
    })
  })

  test("loads the complete batched choice operation within six statements", async () => {
    const trackedPool = new Pool({ connectionString })
    const originalQuery = trackedPool.query.bind(trackedPool)
    let statementCount = 0
    trackedPool.query = ((...args: Parameters<typeof trackedPool.query>) => {
      statementCount += 1
      return originalQuery(...args)
    }) as typeof trackedPool.query
    const trackedRepository = createCommercialWorkflowRepository({
      pool: trackedPool,
    })

    try {
      const results =
        await trackedRepository.listSalesMatchCandidatesForItemsBounded(
          enquiryItemIds
        )
      const search = await trackedRepository.searchSalesMatchCandidates(
        enquiryItemIds[0]!,
        "quote-003"
      )
      expect(results.size).toBe(2)
      expect(search.rows).toHaveLength(1)
      expect(statementCount).toBeLessThanOrEqual(6)
    } finally {
      await trackedRepository.close()
      await trackedPool.end()
    }
  })
})
