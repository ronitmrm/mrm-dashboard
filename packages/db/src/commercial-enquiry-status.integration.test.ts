import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createCommercialWorkflowRepository } from "./commercial-workflow"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const repository = createCommercialWorkflowRepository({ pool })
beforeAll(async () => {
  await migrateDatabase({ connectionString })
})
afterAll(async () => {
  await pool.end()
})

test("Excel View follows each enquiry quote, not the existing Product lifecycle", async () => {
  const code = `ENQ-STATUS-${randomUUID()}`
  await pool.query(
    `WITH organization AS (
       INSERT INTO core.organizations (code, name) VALUES ($1, $1) RETURNING id
     ), customer AS (
       INSERT INTO sales.customers (organization_id, customer_uid, company_name,
         source_system, source_table, source_id)
       SELECT id, 'C1', 'Status Customer', 'test', 'customers', $1
       FROM organization RETURNING id
     ), product AS (
       INSERT INTO catalog.items (organization_id, uid, lifecycle_status,
         description, source_system, source_table, source_id)
       SELECT id, 'M25', 'P', 'Previously ordered product', 'test', 'items', $1
       FROM organization RETURNING id
     ), enquiry AS (
       INSERT INTO sales.enquiries (organization_id, customer_id, enquiry_number,
         received_on, technical_handover_status, source_system, source_table, source_id)
       SELECT organization.id, customer.id, 'ENQ-1', DATE '2026-09-09',
         'Handed Over', 'test', 'enquiries', $1 FROM organization, customer RETURNING id
     ), lines AS (
       INSERT INTO sales.enquiry_items (organization_id, enquiry_id, item_id,
         line_number, customer_part_code, description, quantity,
         technical_review_status, source_system, source_table, source_id)
       SELECT organization.id, enquiry.id, product.id, number, 'PART-' || number,
         'Existing Product', 1, 'Feasible', 'test', 'enquiry_items', $1 || number
       FROM organization, enquiry, product, generate_series(1,5) number
       RETURNING id, line_number
     ) INSERT INTO sales.quote_items (organization_id, customer_id, enquiry_id,
       enquiry_item_id, item_id, lineage_item_id, quote_number, unit_price, status,
       sent_at, ordered_at, source_system, source_table, source_id)
     SELECT organization.id, customer.id, enquiry.id, lines.id, product.id,
       product.id, 'Q-' || lines.line_number, 1,
       CASE lines.line_number WHEN 1 THEN 'Draft' WHEN 2 THEN 'Ready'
         WHEN 3 THEN 'Sent' ELSE 'Accepted' END,
       CASE WHEN lines.line_number >= 3 THEN TIMESTAMPTZ '2026-09-09 10:00:00Z' END,
       CASE WHEN lines.line_number = 4 THEN TIMESTAMPTZ '2026-09-09 11:00:00Z' END,
       'test', 'quote_items', $1 || lines.line_number
     FROM organization, customer, product, enquiry, lines WHERE lines.line_number <= 4`,
    [code]
  )
  const result = await repository.listEnquirySpreadsheetBounded(code)
  expect(
    result.rows.map((row) => ({
      line: row.lineNumber,
      status: row.currentStatus,
      pdf: row.quotePdfStatus,
      sent: row.quotePdfSentAt?.toISOString() ?? null,
    }))
  ).toEqual([
    { line: 1, status: "Quote Costing", pdf: "Not Sent", sent: null },
    { line: 2, status: "Ready To Send", pdf: "Not Sent", sent: null },
    {
      line: 3,
      status: "Quote Sent",
      pdf: "PDF Sent",
      sent: "2026-09-09T10:00:00.000Z",
    },
    {
      line: 4,
      status: "Ordered / P",
      pdf: "PDF Sent",
      sent: "2026-09-09T10:00:00.000Z",
    },
    { line: 5, status: "Technical Review", pdf: "Not Sent", sent: null },
  ])
})
