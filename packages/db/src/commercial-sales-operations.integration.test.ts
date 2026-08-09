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

let emptyOrganizationCode: string
let exactOrganizationCode: string
let overflowOrganizationCode: string
let sentExactOrganizationCode: string

async function seedSalesOrganization(input: {
  code: string
  count: number
  prefix: string
}) {
  const source = randomUUID()
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $1)
      RETURNING id
    `,
    [input.code]
  )
  const organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, $2, 'test', 'commercial_sales_operations', $3)
      RETURNING id
    `,
    [organizationId, `C-${input.prefix}`, randomUUID()]
  )
  if (input.count === 0) return

  const product = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'INTERNAL', 'P', 'Sales operations product',
        'test', 'commercial_sales_operations', $3)
      RETURNING id
    `,
    [organizationId, `P-${input.prefix}`, randomUUID()]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiries (
        organization_id, enquiry_number, customer_id, received_on, status,
        technical_handover_status, source_system, source_table, source_id,
        created_at
      )
      SELECT $1, $4 || '-' || lpad(value::text, 4, '0'), $2,
        DATE '2026-01-01', 'Open', 'Draft', 'test',
        'commercial_sales_operations', $3 || ':enquiry:' || value::text,
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute'
      FROM generate_series(1, $5) value
    `,
    [organizationId, customer.rows[0]!.id, source, input.prefix, input.count]
  )
  await pool.query(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, technical_review_status, source_system,
        source_table, source_id
      )
      SELECT enquiry.organization_id, enquiry.id, 1,
        'PART-' || value::text, 'Sales operation ' || value::text, 1,
        'Need Sales Confirmation', 'test', 'commercial_sales_operations',
        $1 || ':item:' || value::text
      FROM generate_series(1, $3) value
      JOIN sales.enquiries enquiry
        ON enquiry.organization_id = $2
        AND enquiry.source_id = $1 || ':enquiry:' || value::text
    `,
    [source, organizationId, input.count]
  )
  await pool.query(
    `
      INSERT INTO sales.clarification_tasks (
        organization_id, enquiry_id, enquiry_item_id, question, status,
        source_stage, target_stage, source_system, source_table, source_id,
        created_at
      )
      SELECT item.organization_id, item.enquiry_id, item.id,
        'Sales clarification ' || value::text, 'Open', 'Technical', 'Sales',
        'test', 'commercial_sales_operations',
        $1 || ':clarification:' || value::text,
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute'
      FROM generate_series(1, $3) value
      JOIN sales.enquiry_items item
        ON item.organization_id = $2
        AND item.source_id = $1 || ':item:' || value::text
    `,
    [source, organizationId, input.count]
  )
  await pool.query(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, enquiry_id,
        enquiry_item_id, customer_id, item_id, lineage_item_id,
        customer_part_code, quantity, unit_price, currency_code, status,
        is_active, sent_at, updated_at, source_system, source_table, source_id
      )
      SELECT item.organization_id,
        $4 || '-D-' || lpad(value::text, 4, '0'), 1, item.enquiry_id,
        item.id, $5, $6, $6, item.customer_part_code, 1, value, 'USD',
        'Draft', false, NULL,
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute',
        'test', 'commercial_sales_operations',
        $1 || ':draft:' || value::text
      FROM generate_series(1, $3) value
      JOIN sales.enquiry_items item
        ON item.organization_id = $2
        AND item.source_id = $1 || ':item:' || value::text
    `,
    [
      source,
      organizationId,
      input.count,
      input.prefix,
      customer.rows[0]!.id,
      product.rows[0]!.id,
    ]
  )
  await pool.query(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, enquiry_id,
        enquiry_item_id, customer_id, item_id, lineage_item_id,
        customer_part_code, quantity, unit_price, currency_code, status,
        is_active, sent_at, updated_at, source_system, source_table, source_id
      )
      SELECT item.organization_id,
        $4 || '-S-' || lpad(value::text, 4, '0'), 1, item.enquiry_id,
        item.id, $5, $6, $6, item.customer_part_code, 1, value, 'USD',
        'Sent', false,
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute',
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + value * INTERVAL '1 minute',
        'test', 'commercial_sales_operations',
        $1 || ':sent:' || value::text
      FROM generate_series(1, $3) value
      JOIN sales.enquiry_items item
        ON item.organization_id = $2
        AND item.source_id = $1 || ':item:' || value::text
    `,
    [
      source,
      organizationId,
      input.count,
      input.prefix,
      customer.rows[0]!.id,
      product.rows[0]!.id,
    ]
  )
  await pool.query(
    `
      INSERT INTO sales.followups (
        organization_id, enquiry_id, due_on, status, note, channel,
        source_system, source_table, source_id, created_at
      )
      SELECT enquiry.organization_id, enquiry.id,
        DATE '2026-01-01' + ($3 - value), 'Pending',
        'Due-order evidence ' || value::text, 'Email', 'test',
        'commercial_sales_operations', $1 || ':followup:' || value::text,
        TIMESTAMPTZ '2026-01-01 00:00:00+00'
      FROM generate_series(1, $3) value
      JOIN sales.enquiries enquiry
        ON enquiry.organization_id = $2
        AND enquiry.source_id = $1 || ':enquiry:' || value::text
    `,
    [source, organizationId, input.count]
  )
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID().slice(0, 8)
  emptyOrganizationCode = `SALE-EMPTY-${suffix}`
  exactOrganizationCode = `SALE-EXACT-${suffix}`
  overflowOrganizationCode = `SALE-OVER-${suffix}`
  sentExactOrganizationCode = `SALE-SENT-${suffix}`
  await seedSalesOrganization({
    code: emptyOrganizationCode,
    count: 0,
    prefix: "EMPTY",
  })
  await seedSalesOrganization({
    code: exactOrganizationCode,
    count: 200,
    prefix: "EXACT",
  })
  await seedSalesOrganization({
    code: overflowOrganizationCode,
    count: 201,
    prefix: "OVER",
  })
  await seedSalesOrganization({
    code: sentExactOrganizationCode,
    count: 50,
    prefix: "SENT",
  })
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("bounded Sales operational repositories", () => {
  const twoHundredSections = [
    ["clarification", "listSalesClarificationQueueBounded"],
    ["handover", "listSalesHandoverQueueBounded"],
    ["quote-ready", "listSalesQuoteReadyQueueBounded"],
    ["enquiries", "listEnquiriesBounded"],
    ["follow-ups", "listFollowupsBounded"],
  ] as const

  test.each(twoHundredSections)(
    "%s reports zero, exact-cap, and cap-plus-one coverage",
    async (_section, method) => {
      const read = repository[method].bind(repository)
      await expect(read(emptyOrganizationCode)).resolves.toEqual({
        coverage: { limit: 200, returned: 0, truncated: false },
        rows: [],
      })
      await expect(read(exactOrganizationCode)).resolves.toMatchObject({
        coverage: { limit: 200, returned: 200, truncated: false },
        rows: expect.arrayContaining([expect.any(Object)]),
      })
      await expect(read(overflowOrganizationCode)).resolves.toMatchObject({
        coverage: { limit: 200, returned: 200, truncated: true },
        rows: expect.arrayContaining([expect.any(Object)]),
      })
    }
  )

  test("preserves each section's business order", async () => {
    const clarification = await repository.listSalesClarificationQueueBounded(
      overflowOrganizationCode
    )
    expect(clarification.rows[0]?.enquiryNumber).toBe("OVER-0001")
    expect(clarification.rows.at(-1)?.enquiryNumber).toBe("OVER-0200")

    const handover = await repository.listSalesHandoverQueueBounded(
      overflowOrganizationCode
    )
    const quoteReady = await repository.listSalesQuoteReadyQueueBounded(
      overflowOrganizationCode
    )
    const enquiries = await repository.listEnquiriesBounded(
      overflowOrganizationCode
    )
    const followups = await repository.listFollowupsBounded(
      overflowOrganizationCode
    )
    for (const rows of [
      handover.rows,
      quoteReady.rows,
      enquiries.rows,
      followups.rows,
    ]) {
      expect(rows[0]?.enquiryNumber).toBe("OVER-0201")
      expect(rows.at(-1)?.enquiryNumber).toBe("OVER-0002")
    }
  })

  test("retains an explicit 50-enquiry sent-quote summary", async () => {
    const exact = await repository.listSalesSentQuoteQueueBounded(
      sentExactOrganizationCode
    )
    expect(exact.coverage).toEqual({
      limit: 50,
      returned: 50,
      truncated: false,
    })
    expect(exact.rows[0]?.enquiryNumber).toBe("SENT-0050")

    const overflow = await repository.listSalesSentQuoteQueueBounded(
      overflowOrganizationCode
    )
    expect(overflow.coverage).toEqual({
      limit: 50,
      returned: 50,
      truncated: true,
    })
    expect(overflow.rows[0]?.enquiryNumber).toBe("OVER-0201")
    expect(overflow.rows.at(-1)?.enquiryNumber).toBe("OVER-0152")
  })
})
