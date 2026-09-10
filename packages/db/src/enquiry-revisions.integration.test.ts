import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { createCommercialWorkflowRepository } from "./commercial-workflow"
import { migrateDatabase } from "./migrate"
import { createCommercialRevisionsRepository } from "./commercial-revisions"
import { createCommercialCostingRepository } from "./commercial-costing"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const workflow = createCommercialWorkflowRepository({ pool })
beforeAll(async () => {
  await migrateDatabase({ connectionString })
})
afterAll(async () => {
  await pool.end()
})

async function fixture() {
  const code = `ER-${randomUUID()}`
  const seeded = await pool.query<{
    organization_id: string
    enquiry_id: string
    customer_id: string
  }>(
    `
    WITH org AS (INSERT INTO core.organizations(code,name) VALUES ($1,$1) RETURNING id),
    customer AS (INSERT INTO sales.customers(organization_id,customer_uid,company_name,source_system,source_table,source_id)
      SELECT id,'C1','Revision Customer','test','customers',$1 FROM org RETURNING id),
    enquiry AS (INSERT INTO sales.enquiries(organization_id,customer_id,enquiry_number,received_on,technical_handover_status,source_system,source_table,source_id)
      SELECT org.id,customer.id,'ENQ-1',current_date,'Handed Over','test','enquiries',$1 FROM org,customer RETURNING id)
    SELECT org.id organization_id, customer.id customer_id,enquiry.id enquiry_id FROM org,customer,enquiry`,
    [code]
  )
  const data = seeded.rows[0]!
  const lines = await pool.query<{ id: string }>(
    `
    WITH products AS (INSERT INTO catalog.items(organization_id,uid,description,source_system,source_table,source_id)
      SELECT $1,'Q-'||n,'Revision part','test','items',$2||n FROM generate_series(1,2) n RETURNING id,uid),
    lines AS (INSERT INTO sales.enquiry_items(organization_id,enquiry_id,item_id,line_number,customer_part_code,description,quantity,technical_review_status,source_system,source_table,source_id)
      SELECT $1,$3,id,right(uid,1)::int,uid,'Revision part',1,'Feasible','test','lines',$2||uid FROM products RETURNING id,item_id,line_number),
    quotes AS (INSERT INTO sales.quote_items(organization_id,enquiry_id,enquiry_item_id,customer_id,item_id,lineage_item_id,quote_number,unit_price,rate_usd,status,sent_at,source_system,source_table,source_id)
      SELECT $1,$3,id,$4,item_id,item_id,'QUOTE-'||line_number,25,25,'Sent',now(),'test','quotes',$2||line_number FROM lines RETURNING id),
    designs AS (INSERT INTO sales.design_tasks(organization_id,enquiry_item_id,design_status,next_stage_status,matched_product_id,source_system,source_table,source_id)
      SELECT $1,id,'Not Required','Quoted',item_id,'test','designs',$2||line_number FROM lines)
    SELECT id FROM lines ORDER BY line_number`,
    [data.organization_id, code, data.enquiry_id, data.customer_id]
  )
  return { ...data, code, lineIds: lines.rows.map((row) => row.id) }
}

test("Sales requests pricing revision on selected lines of the same enquiry and cannot duplicate it", async () => {
  const f = await fixture()
  const costing = createCommercialCostingRepository({ pool })
  const quotes = await costing.listQuotes(f.code)
  for (const quote of quotes) {
    await workflow.createFollowup({ organizationId: f.organization_id,
      enquiryId: f.enquiry_id, quoteItemId: quote.id, dueOn: "2026-12-01",
      note: "Customer requested a callback" })
  }
  await workflow.requestEnquiryRevision({
    enquiryId: f.enquiry_id,
    kind: "Pricing",
    reason: "Customer asks for a lower price",
    enquiryItemIds: [f.lineIds[0]!],
  })
  const rows = (await workflow.listEnquirySpreadsheetBounded(f.code)).rows
  expect(rows.map((row) => row.currentStatus)).toEqual([
    "Customer Costing",
    "Quote Sent",
  ])
  expect(rows.map((row) => row.quotePdfStatus)).toEqual([
    "PDF Sent",
    "PDF Sent",
  ])
  await expect(
    workflow.requestEnquiryRevision({
      enquiryId: f.enquiry_id,
      kind: "Terms",
      reason: "Another request",
      enquiryItemIds: [],
    })
  ).rejects.toThrow(/already open/i)
  const revisions = await workflow.listEnquiryRevisions(f.enquiry_id)
  const followups = await workflow.listFollowups(f.code)
  expect(followups.filter(row => row.status === "Completed")).toHaveLength(1)
  expect(followups.find(row => row.status === "Completed")?.note).toBe(
    "Customer requested a callback\nRevision initiated."
  )
  expect(followups.filter(row => row.status === "Pending")).toHaveLength(1)
  expect(revisions).toHaveLength(1)
  expect(revisions[0]).toMatchObject({
    kind: "Pricing",
    reason: "Customer asks for a lower price",
    status: "Open",
  })
})

test("quotation revisions preserve original terms and share one number across enquiry lines", async () => {
  const f = await fixture()
  const costing = createCommercialCostingRepository({ pool })
  await workflow.requestEnquiryRevision({ enquiryId: f.enquiry_id, kind: "Terms", reason: "New reports", enquiryItemIds: [] })
  expect((await workflow.listQuotationVersions(f.enquiry_id)).map(row => [row.revision, row.status])).toEqual([[0, "Sent"], [1, "Draft"]])
  await workflow.updateEnquiry({ enquiryId: f.enquiry_id, organizationId: f.organization_id,
    customerId: f.customer_id, commercialTerms: { reports: "MTC included" } })
  const quotes = await costing.listQuotes(f.code)
  await costing.sendQuote({quoteItemId: quotes.find(row => row.status === "Ready")!.id, followupDueOn: "2026-12-01"})
  const versions = await workflow.listQuotationVersions(f.enquiry_id)
  expect(versions.map(row => [row.revision, row.status])).toEqual([[0, "Sent"], [1, "Sent"]])
  expect(versions[0]!.terms?.reports).toBeNull()
  expect(versions[1]!.terms?.reports).toBe("MTC included")
  expect(versions[1]!.lines).toHaveLength(2)
  expect((await workflow.listEnquirySpreadsheetBounded(f.code)).rows.map(row=>row.quoteRevision)).toEqual([1,1])
  expect((await workflow.listSalesSentQuoteQueue(f.code)).map(row=>row.quoteRevision)).toEqual([1,0])
})

test("pricing-term edits close old follow-ups when they reopen customer costing", async () => {
  const f = await fixture()
  for (const quote of await createCommercialCostingRepository({ pool }).listQuotes(f.code)) {
    await workflow.createFollowup({ organizationId: f.organization_id, enquiryId: f.enquiry_id,
      quoteItemId: quote.id, dueOn: "2026-11-01" })
  }
  await workflow.updateEnquiry({ enquiryId: f.enquiry_id, organizationId: f.organization_id,
    customerId: f.customer_id, commercialTerms: { currency: "EUR" } })
  const followups = await workflow.listFollowups(f.code)
  expect(followups.map(row => ({ status: row.status, note: row.note }))).toEqual([
    { status: "Completed", note: "Revision initiated." },
    { status: "Completed", note: "Revision initiated." },
  ])
})

test("terms-only revision stays with Sales and republishes without recosting", async () => {
  const f = await fixture()
  for (const quote of await createCommercialCostingRepository({ pool }).listQuotes(f.code)) {
    await workflow.createFollowup({ organizationId: f.organization_id, enquiryId: f.enquiry_id,
      quoteItemId: quote.id, dueOn: "2026-11-01" })
  }
  await workflow.requestEnquiryRevision({
    enquiryId: f.enquiry_id,
    kind: "Terms",
    reason: "Update reports",
    enquiryItemIds: [],
  })
  expect(
    (await workflow.listEnquirySpreadsheetBounded(f.code)).rows.map(
      (row) => row.currentStatus
    )
  ).toEqual(["Sales", "Sales"])
  await workflow.updateEnquiry({
    enquiryId: f.enquiry_id,
    organizationId: f.organization_id,
    customerId: f.customer_id,
    commercialTerms: { reports: "Inspection report included" },
  })
  const result = await workflow.listEnquirySpreadsheetBounded(f.code)
  expect(result.rows.map((row) => row.currentStatus)).toEqual([
    "Ready To Send",
    "Ready To Send",
  ])
  expect(result.rows.map((row) => row.quotePdfStatus)).toEqual([
    "Not Sent",
    "Not Sent",
  ])
  const costing = createCommercialCostingRepository({ pool })
  const quotes = await costing.listQuotes(f.code)
  expect((await workflow.listFollowups(f.code)).filter(row => row.status === "Pending")).toHaveLength(0)
  expect(quotes.map(q=>q.rateUsd)).toEqual([25,25,25,25])
  expect(quotes.filter((q) => q.status === "Sent")).toHaveLength(2)
  expect(
    quotes.filter((q) => q.status === "Ready").map((q) => q.revision)
  ).toEqual([2, 2])
  await costing.sendQuote({
    quoteItemId: quotes.find((q) => q.status === "Ready")!.id,
    followupDueOn: "2026-12-01",
  })
  const followups = await workflow.listFollowups(f.code)
  expect(followups.filter(row => row.status === "Completed")).toHaveLength(2)
  expect(followups.filter(row => row.status === "Pending")).toHaveLength(2)
  expect((await workflow.listEnquiryRevisions(f.enquiry_id))[0]!.status).toBe(
    "Completed"
  )
  expect(
    (await workflow.listEnquirySpreadsheetBounded(f.code)).rows.map(
      (row) => row.currentStatus
    )
  ).toEqual(["Quote Sent", "Quote Sent"])
})

test("technical revision opens controlled Design work for a quoted part without replacing its enquiry", async () => {
  const f = await fixture()
  await pool.query(
    `INSERT INTO catalog.product_design_revisions(organization_id,item_id,revision_number,revision_label,status,is_current,effective_on,change_reason,design_snapshot,bom_snapshot,source_system,source_table,source_id)
    SELECT organization_id,id,0,'00','Released',true,current_date,'Initial',to_jsonb(item),'[]'::jsonb,'test','design_revision',id::text FROM catalog.items item WHERE organization_id=$1`,
    [f.organization_id]
  )
  await workflow.requestEnquiryRevision({
    enquiryId: f.enquiry_id,
    kind: "Technical",
    reason: "Customer changed dimensions",
    enquiryItemIds: [f.lineIds[0]!],
  })
  const [request] = await workflow.listEnquiryRevisions(f.enquiry_id)
  const ecnId = request!.lines[0]!.engineeringChangeNoteId!
  const ecn = await createCommercialRevisionsRepository({
    pool,
  }).getEngineeringChangeNote(f.code, ecnId)
  expect(ecn).toMatchObject({
    status: "Pending Design",
    reason: "Customer changed dimensions",
  })
  expect(
    (await workflow.listEnquirySpreadsheetBounded(f.code)).rows.map(
      (row) => row.currentStatus
    )
  ).toEqual(["Design", "Quote Sent"])
  const revisions = createCommercialRevisionsRepository({ pool })
  await revisions.completeEngineeringChangeDesign({
    engineeringChangeNoteId: ecnId,
    itemPatch: { description: "Revised dimensions" },
  })
  const reviewer = await pool.query<{ id: string }>(
    "INSERT INTO identity.users(name,email,email_verified) VALUES('Reviewer',$1,true) RETURNING id",
    [`${randomUUID()}@example.test`]
  )
  await revisions.applyEngineeringChangeDesignReview({
    engineeringChangeNoteId: ecnId,
    decision: "Approve",
    actorUserId: reviewer.rows[0]!.id,
  })
  expect(
    (await workflow.listEnquirySpreadsheetBounded(f.code)).rows[0]!
      .currentStatus
  ).toBe("Product Costing")
  await revisions.completeEngineeringChangeProductCosting({
    engineeringChangeNoteId: ecnId,
    itemPatch: { productCostInr: 30 },
  })
  expect(
    (await workflow.listEnquirySpreadsheetBounded(f.code)).rows[0]!
      .currentStatus
  ).toBe("Customer Costing")
  await pool.query(
    `WITH terms AS (INSERT INTO sales.commercial_terms(organization_id,term_type,name,value,cost_per_kg,source_system,source_table,source_id)
    SELECT $1,kind,kind,kind,0,'test','terms',$2||kind FROM unnest(ARRAY['incoterms','packaging_terms']) kind RETURNING id,term_type)
    UPDATE sales.enquiries SET incoterm_id=(SELECT id FROM terms WHERE term_type='incoterms'),packaging_term_id=(SELECT id FROM terms WHERE term_type='packaging_terms') WHERE id=$3`,
    [f.organization_id, f.code, f.enquiry_id]
  )
  const costing = createCommercialCostingRepository({ pool })
  const before = (await costing.listQuotes(f.code)).find(
    (q) => q.enquiryItemId === f.lineIds[0]
  )!
  const current = await revisions.getEngineeringChangeNote(f.code, ecnId)
  const updated = await costing.saveQuote({
    enquiryItemId: f.lineIds[0]!,
    itemId: current!.itemId,
    customerPartCode: "COSTING-OVERRIDE",
    quantity: 999,
    action: "complete",
    inputs: {
      conversionRate: 1,
      packingCost: 0,
      shippingCost: 0,
      scrapRate: 0,
      profitPercent: 0,
      purchaseTimes: 1,
    },
  })
  const saved = await costing.getQuote(updated.id)
  expect(saved.customerPartCode).toBe("Q-1")
  expect(saved.quantity).toBe(1)
  expect(
    (await workflow.listEnquirySpreadsheetBounded(f.code)).rows[0]!
      .currentStatus
  ).toBe("Ready To Send")
  expect((await costing.getQuote(before.id)).status).toBe("Sent")
  await costing.sendQuote({
    quoteItemId: updated.id,
    followupDueOn: "2026-12-01",
  })
  const versions = await workflow.listQuotationVersions(f.enquiry_id)
  const originalSibling = versions[0]!.lines.find(line=>line.enquiryItemId===f.lineIds[1])!
  const revisedSibling = versions[1]!.lines.find(line=>line.enquiryItemId===f.lineIds[1])!
  expect(revisedSibling).toEqual(originalSibling)
  expect(versions[1]!.lines.find(line=>line.enquiryItemId===f.lineIds[0])?.quoteItemId).toBe(updated.id)
  expect((await workflow.listEnquirySpreadsheetBounded(f.code)).rows.map(row=>row.quoteRevision)).toEqual([1,1])
  expect((await workflow.listEnquiryRevisions(f.enquiry_id))[0]!.status).toBe(
    "Completed"
  )
})

test("revision requests reject a different salesperson and foreign enquiry lines", async () => {
  const f = await fixture()
  const actor = await pool.query<{ id: string }>(
    "INSERT INTO identity.users(name,email,email_verified) VALUES('Other Sales',$1,true) RETURNING id",
    [`${randomUUID()}@example.test`]
  )
  await expect(
    workflow.requestEnquiryRevision({
      actorUserId: actor.rows[0]!.id,
      enquiryId: f.enquiry_id,
      kind: "Pricing",
      reason: "Not my enquiry",
      enquiryItemIds: f.lineIds,
    })
  ).rejects.toThrow(/not found|assigned/i)
  await expect(
    workflow.requestEnquiryRevision({
      enquiryId: f.enquiry_id,
      kind: "Pricing",
      reason: "Wrong line",
      enquiryItemIds: [randomUUID()],
    })
  ).rejects.toThrow(/valid enquiry lines/i)
  expect(await workflow.listEnquiryRevisions(f.enquiry_id)).toEqual([])
})

test("terms revision cannot bypass unfinished customer recosting", async()=>{
  const f=await fixture()
  await pool.query("UPDATE sales.enquiry_items SET customer_recost_required=true WHERE id=$1",[f.lineIds[0]])
  await expect(workflow.requestEnquiryRevision({enquiryId:f.enquiry_id,kind:'Terms',reason:'Change reports',enquiryItemIds:[]})).rejects.toThrow(/Complete pending lines/i)
})
