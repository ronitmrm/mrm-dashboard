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
let customerId: string
let enquiryId: string
let existingProductId: string
let organizationId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = Date.now().toString(36)
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'MIG-07 Test')
      RETURNING id
    `,
    [`MIG07-${suffix}`]
  )
  organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      VALUES ($1, $2, 'Workflow Customer', 'test', 'customers', $2)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`]
  )
  customerId = customer.rows[0]!.id
  const product = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, description, source_system, source_table,
        source_id
      )
      VALUES ($1, $2, 'Existing product', 'test', 'products', $2)
      RETURNING id
    `,
    [organizationId, `M-${suffix}`]
  )
  existingProductId = product.rows[0]!.id
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("PostgreSQL enquiry-to-design workflow", () => {
  test("classifies imported rows with the executable Pricing match order", async () => {
    const suffix = Date.now().toString(36)
    const exactCode = `MATCH-${suffix}`
    await pool.query(
      `
        INSERT INTO sales.quote_items (
          organization_id, quote_number, revision, customer_id, item_id,
          lineage_item_id, customer_part_code, quantity, unit_price,
          currency_code, status, is_active, sent_at, price_lineage_key,
          source_system, source_table, source_id
        )
        VALUES (
          $1, $2, 1, $3, $4, $4, $5, 1, 10, 'USD', 'Sent', true,
          now(), $6, 'test', 'quote_items', $7
        )
      `,
      [
        organizationId,
        `QT-${suffix}`,
        customerId,
        existingProductId,
        exactCode,
        `code:${exactCode.toLowerCase()}`,
        `classifier-quote-${suffix}`,
      ]
    )
    const legacyQuoteUid = `Q-LEGACY-${suffix}`
    await pool.query(
      `
        INSERT INTO catalog.item_aliases (
          organization_id, item_id, alias_type, alias, source_system,
          source_table, source_id
        )
        VALUES ($1, $2, 'QUOTE_UID', $3, 'test', 'item_aliases', $4)
      `,
      [organizationId, existingProductId, legacyQuoteUid, randomUUID()]
    )
    const priorEnquiry = await repository.createEnquiry({
      commercialTerms: {
        conversionRate: 83.25,
        currency: "USD",
        incoterms: "FOB",
        packagingTerms: "Export",
        paymentTerms: "Net 30",
        shipmentMode: "Sea",
      },
      customerId,
      organizationId,
      receivedOn: "2026-07-21",
      source: "Email",
    })
    const inProgressCode = `WORK-${suffix}`
    await repository.addEnquiryItem({
      customerPartCode: inProgressCode,
      description: "Work already in progress",
      enquiryId: priorEnquiry.id,
      organizationId,
      quantity: 1,
    })
    const targetEnquiry = await repository.createEnquiry({
      commercialTerms: {
        conversionRate: 83.25,
        currency: "USD",
        incoterms: "FOB",
        packagingTerms: "Export",
        paymentTerms: "Net 30",
        shipmentMode: "Sea",
      },
      customerId,
      organizationId,
      receivedOn: "2026-07-21",
      source: "Email",
    })
    const review = await repository.createImportReview({
      enquiryId: targetEnquiry.id,
      importKey: `classifier-${suffix}`,
      organizationId,
      rows: [
        { rawValues: { part: exactCode, description: "Exact" }, rowNumber: 1, status: "Unclassified" },
        { rawValues: { part: inProgressCode, description: "Work" }, rowNumber: 2, status: "Unclassified" },
        { rawValues: { part: `${exactCode.slice(0, 6)}-REVIEW`, description: "Possible" }, rowNumber: 3, status: "Unclassified" },
        { rawValues: { part: `DESC-${suffix}`, description: "Existing product" }, rowNumber: 4, status: "Unclassified" },
        { rawValues: { part: `NEW-${suffix}`, description: "Brand new component" }, rowNumber: 5, status: "Unclassified" },
        { rawValues: { part: "", description: "Missing part" }, rowNumber: 6, status: "Unclassified" },
        { rawValues: { part: legacyQuoteUid, description: "Historical Q alias" }, rowNumber: 7, status: "Unclassified" },
        { rawValues: { part: "", description: "" }, rowNumber: 8, status: "Unclassified" },
      ],
    })

    expect(
      review.rows.map((row) => [row.status, row.suggestedAction])
    ).toEqual([
      ["Existing Quoted Match", "Commercial Requote"],
      ["In Progress Match", "Link to existing work"],
      ["Possible Match", "Review Manually"],
      ["Description Match - Sales Check", "Ask Sales"],
      ["New Line", "Add New Line"],
      ["Missing Information", "Skip"],
      ["Existing Quoted Match", "Commercial Requote"],
    ])

    const applied = await repository.applyImportReview({
      decisions: [
        { action: "Commercial Requote", rowNumber: 1 },
        { action: "Link to existing work", rowNumber: 2 },
        { action: "Technical Revision", rowNumber: 3 },
        { action: "Ask Sales", rowNumber: 4 },
        { action: "Add New Line", rowNumber: 5 },
        { action: "Commercial Requote", rowNumber: 7 },
      ],
      reviewId: review.id,
    })
    expect(applied.rows.map((row) => row.appliedAction)).toEqual([
      "Commercial Requote",
      "Link to existing work",
      "Technical Revision",
      "Ask Sales",
      "Add New Line",
      "Skip",
      "Commercial Requote",
    ])
    expect(
      applied.rows.filter((row) => row.createdEnquiryItemId)
    ).toHaveLength(6)
  })

  test("preserves handover, clarification, design, attachment, and import rules", async () => {
    const suffix = Date.now().toString(36)
    const enquiry = await repository.createEnquiry({
      commercialTerms: {
        conversionRate: 83.25,
        currency: "USD",
        incoterms: "FOB",
        packagingTerms: "Export",
        paymentTerms: "Net 30",
        shipmentMode: "Sea",
      },
      customerId,
      organizationId,
      receivedOn: "2026-07-21",
      source: "Email",
    })
    enquiryId = enquiry.id

    const line = await repository.addEnquiryItem({
      customerPartCode: `NEW-${suffix}`,
      description: "New precision component",
      enquiryId,
      grade: "CZ121",
      organizationId,
      quantity: 250,
      targetPrice: 4.5,
    })

    await expect(
      repository.handOverToTechnicalReview(enquiryId)
    ).resolves.toMatchObject({
      technicalHandoverStatus: "Handed Over",
    })

    await repository.updateTechnicalReview({
      checklist: {
        drawing_available: true,
        drawing_information_complete: false,
        finish_plating_clear: true,
        grade_material_clear: true,
        packaging_clear: true,
        tooling_process_feasible: true,
      },
      enquiryItemId: line.id,
      missingInformation: "Confirm the missing tolerance.",
      status: "Need Clarification",
    })

    let snapshot = await repository.getEnquiry(enquiryId)
    expect(snapshot.items[0]).toMatchObject({
      technicalReviewStatus: "Need Clarification",
    })
    expect(snapshot.clarifications).toHaveLength(1)
    expect(snapshot.clarifications[0]).toMatchObject({
      sourceStage: "Technical Review",
      status: "Open",
      targetStage: "Sales",
    })

    await repository.completeSalesClarification({
      clarificationTaskId: snapshot.clarifications[0]!.id,
      enquiryItemId: line.id,
      response: "Tolerance is ±0.05 mm.",
    })
    await repository.updateTechnicalReview({
      checklist: {
        drawing_available: true,
        drawing_information_complete: true,
        finish_plating_clear: true,
        grade_material_clear: true,
        packaging_clear: true,
        tooling_process_feasible: true,
      },
      enquiryItemId: line.id,
      status: "Feasible",
      technicalRemarks: "Feasible after clarification.",
    })

    const quotedPartUid = `Q-${suffix}`
    await repository.saveDesign({
      bomLines: [
        {
          casting: 1,
          componentCode: quotedPartUid,
          componentSource: "New",
          grade: "CZ121",
          lineNumber: 1,
          pieceWeight: 0.025,
          quantity: 1,
          rodSize: "12 mm",
          rodType: "Round",
        },
      ],
      designStatus: "Design Complete",
      enquiryItemId: line.id,
      itemType: "List",
      portfolioMatchStatus: "New Design Required",
      quotedPartUid,
    })
    const costing = await repository.prepareCostingFromDesign(line.id)
    expect(costing).toMatchObject({
      nextStageStatus: "Product Costing",
      productUid: quotedPartUid,
    })

    await expect(
      repository.recordAttachment({
        byteSize: 10,
        fileName: "../unsafe.pdf",
        mediaType: "application/pdf",
        organizationId,
        sourceId: `unsafe-${suffix}`,
        storageKey: `attachments/${suffix}/unsafe.pdf`,
        targetId: line.id,
      })
    ).rejects.toThrow("safe base name")

    const attachment = await repository.recordAttachment({
      byteSize: 10,
      fileName: "drawing.pdf",
      mediaType: "application/pdf",
      organizationId,
      sourceId: `drawing-${suffix}`,
      storageKey: `attachments/${suffix}/drawing.pdf`,
      targetId: line.id,
    })
    expect(attachment.fileName).toBe("drawing.pdf")

    const importInput = {
      enquiryId,
      importKey: `import-${suffix}`,
      organizationId,
      rows: [
        {
          rawValues: {
            description: "Imported component",
            part: `IMP-${suffix}`,
            quantity: 5,
          },
          rowNumber: 1,
          status: "Ready",
        },
      ],
    }
    const firstImport = await repository.createImportReview(importInput)
    const repeatedImport = await repository.createImportReview(importInput)
    expect(repeatedImport.id).toBe(firstImport.id)
    expect(repeatedImport.rows).toHaveLength(1)

    await repository.applyImportReview({
      decisions: [{ action: "Create new line", rowNumber: 1 }],
      reviewId: firstImport.id,
    })
    await repository.applyImportReview({
      decisions: [{ action: "Create new line", rowNumber: 1 }],
      reviewId: firstImport.id,
    })

    snapshot = await repository.getEnquiry(enquiryId)
    expect(snapshot.items).toHaveLength(2)
    expect(snapshot.importReviews[0]).toMatchObject({ status: "Applied" })
    const auditEvents = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit.events
        WHERE organization_id = $1
          AND source_table = 'workflow_events'
      `,
      [organizationId]
    )
    expect(Number(auditEvents.rows[0]!.count)).toBeGreaterThanOrEqual(7)
  })

  test("preserves the existing-portfolio design shortcut", async () => {
    const snapshot = await repository.getEnquiry(enquiryId)
    await expect(
      repository.saveDesign({
        designStatus: "Not Required",
        enquiryItemId: snapshot.items[1]!.id,
        itemType: "List",
        matchedProductId: existingProductId,
        portfolioMatchStatus: "Matches Existing Portfolio",
        quotedPartUid: null,
      })
    ).resolves.toMatchObject({
      nextStageStatus: "Product Costing Complete",
    })
  })
})
