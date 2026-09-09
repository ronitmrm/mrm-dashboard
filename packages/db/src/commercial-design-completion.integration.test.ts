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

test("a confirmed portfolio match stays in Design Complete and leaves Active Design", async () => {
  const organizationCode = `DES-MATCH-${randomUUID().slice(0, 8)}`
  const fixture = await pool.query<{
    organization_id: string
    customer_id: string
    product_id: string
  }>(
    `WITH organization AS (
       INSERT INTO core.organizations (code, name) VALUES ($1, $1) RETURNING id
     ), customer AS (
       INSERT INTO sales.customers (organization_id, customer_uid, company_name,
         source_system, source_table, source_id)
       SELECT id, 'C1', 'Portfolio Match Customer', 'test', 'customers', $1
       FROM organization RETURNING id
     ), product AS (
       INSERT INTO catalog.items (organization_id, uid, uid_kind, lifecycle_status,
         description, source_system, source_table, source_id)
       SELECT id, 'M25', 'INTERNAL', 'P', 'Existing Portfolio Part', 'test', 'items', $1
       FROM organization RETURNING id
     ) SELECT organization.id AS organization_id, customer.id AS customer_id,
         product.id AS product_id FROM organization, customer, product`,
    [organizationCode]
  )
  const {
    organization_id: organizationId,
    customer_id: customerId,
    product_id: productId,
  } = fixture.rows[0]!
  const enquiry = await repository.createEnquiry({
    organizationId,
    customerId,
    receivedOn: "2026-09-09",
    commercialTerms: {
      conversionRate: 1,
      currency: "USD",
      incoterms: "FOB",
      packagingTerms: "Export",
      paymentTerms: "Net 30",
      shipmentMode: "Sea",
    },
  })
  const line = await repository.addEnquiryItem({
    organizationId,
    enquiryId: enquiry.id,
    customerPartCode: "MATCH-1",
    description: "Part requiring portfolio review",
    quantity: 1,
  })
  await repository.handOverToTechnicalReview(enquiry.id)
  await repository.updateTechnicalReview({
    enquiryItemId: line.id,
    checklist: {},
    status: "Feasible",
  })
  await repository.saveDesign({
    enquiryItemId: line.id,
    designStatus: "Pending Design",
    itemType: "List",
    completionRequested: false,
    quotedPartUid: null,
    portfolioMatchStatus: "Matches Existing Portfolio",
    matchedProductId: productId,
  })

  const completed = await repository.listDesignQueueBounded(
    organizationCode,
    200,
    "completed"
  )
  expect(completed.rows).toMatchObject([
    {
      enquiryItemId: line.id,
      matchedProductUid: "M25",
      portfolioMatchStatus: "Matches Existing Portfolio",
      designStatus: "Not Required",
      nextStageStatus: "Product Costing Complete",
    },
  ])
  const active = await repository.listDesignQueueBounded(
    organizationCode,
    200,
    "active"
  )
  expect(active.rows).toEqual([])
})
