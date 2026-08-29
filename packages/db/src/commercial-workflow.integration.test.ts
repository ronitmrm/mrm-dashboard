import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  createArtifactService,
  type ArtifactStorageProvider,
} from "./artifacts"
import {
  createCommercialWorkflowRepository,
  prepareImportReviewArtifactTarget,
} from "./commercial-workflow"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialWorkflowRepository({ connectionString })
const artifactReader = createArtifactService({ connectionString })
let customerId: string
let enquiryId: string
let existingProductId: string
let organizationCode: string
let organizationId: string

class ImportReviewArtifactProvider implements ArtifactStorageProvider {
  constructor(private readonly failUpload = false) {}

  async delete() {}

  async upload() {
    if (this.failUpload) throw new Error("Import source upload failed.")
    return {
      key: `import-source-${randomUUID()}`,
      url: `https://files.example.test/import-source-${randomUUID()}`,
    }
  }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = Date.now().toString(36)
  organizationCode = `MIG07-${suffix}`
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'MIG-07 Test')
      RETURNING id
    `,
    [organizationCode]
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
        organization_id, uid, uid_kind, lifecycle_status, description,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'INTERNAL', 'P', 'Existing product', 'test', 'products', $2)
      RETURNING id
    `,
    [organizationId, `M-${suffix}`]
  )
  existingProductId = product.rows[0]!.id
})

afterAll(async () => {
  await artifactReader.close()
  await repository.close()
  await pool.end()
})

describe("PostgreSQL enquiry-to-design workflow", () => {
  test("retains the original enquiry-line source on its Import Review", async () => {
    const enquiry = await repository.createEnquiry({
      customerId,
      organizationId,
      receivedOn: "2026-08-22",
      source: "Email",
    })
    const reviewId = randomUUID()
    const reviewInput = {
      enquiryId: enquiry.id,
      importKey: `retained-source-${randomUUID()}`,
      organizationId,
      reviewId,
      rows: [
        {
          rawValues: { description: "Retained import", part: "RET-21" },
          rowNumber: 2,
          status: "Unclassified",
        },
      ],
    }
    const provider = new ImportReviewArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })
    const target = {
      id: reviewId,
      schema: "sales",
      table: "enquiry_import_reviews",
    }
    const storeInput = {
      actorUserId: null,
      authorizeTarget: (
        client: Parameters<typeof prepareImportReviewArtifactTarget>[0],
        { isRetry }: { isRetry: boolean }
      ) => prepareImportReviewArtifactTarget(client, reviewInput, { isRetry }),
      bytes: Buffer.from("Part,Description\nRET-21,Retained import\n"),
      fileName: "enquiry-lines.csv",
      idempotencyKey: `import-review-source:${reviewId}`,
      mediaType: "text/csv",
      organizationId,
      origin: "uploaded" as const,
      purpose: "import_source",
      target,
    }

    try {
      const failingArtifacts = createArtifactService({
        connectionString,
        provider: new ImportReviewArtifactProvider(true),
      })
      try {
        await expect(failingArtifacts.store(storeInput)).rejects.toThrow(
          "Import source upload failed"
        )
      } finally {
        await failingArtifacts.close()
      }
      await expect(repository.getImportReview(reviewId)).rejects.toThrow(
        "Import review was not found"
      )

      const source = await artifacts.store(storeInput)

      expect(
        await artifacts.listHistory({
          organizationId,
          purpose: "import_source",
          target,
        })
      ).toMatchObject([
        { fileName: "enquiry-lines.csv", isCurrent: true, version: 1 },
      ])
      await expect(repository.getImportReview(reviewId)).resolves.toMatchObject(
        {
          sourceFile: {
            fileName: "enquiry-lines.csv",
            publicUrl: source.publicUrl,
          },
        }
      )
    } finally {
      await artifacts.close()
    }
  })

  test("copies customer commercial defaults into a new enquiry", async () => {
    await pool.query(
      `
        UPDATE sales.customers
        SET default_buyer_name = 'Default buyer',
          default_incoterms = 'FOB',
          default_payment_terms = 'Net 30',
          default_shipment_mode = 'Sea',
          default_packaging_terms = 'Export box',
          default_currency = 'EUR'
        WHERE id = $1
      `,
      [customerId]
    )

    const enquiry = await repository.createEnquiry({
      customerId,
      organizationId,
      receivedOn: "2026-08-20",
    })
    const workspace = await repository.getEnquiry(enquiry.id)

    expect(workspace.enquiry).toMatchObject({
      buyerName: "Default buyer",
      currency: "EUR",
      incoterms: "FOB",
      packagingTerms: "Export box",
      paymentTerms: "Net 30",
      shipmentMode: "Sea",
    })
  })

  test("loads attachments for many targets in one statement", async () => {
    const enquiry = await repository.createEnquiry({
      customerId,
      organizationId,
      receivedOn: "2026-08-08",
      source: "Email",
    })
    const targets = await Promise.all(
      [0, 1].map((index) =>
        repository.addEnquiryItem({
          customerPartCode: `BATCH-${randomUUID()}`,
          description: `Batch attachment target ${index}`,
          enquiryId: enquiry.id,
          organizationId,
          quantity: 1,
        })
      )
    )
    const targetIds = targets.map(({ id }) => id)
    await Promise.all(
      targetIds.map((targetId, index) =>
        repository.recordAttachment({
          byteSize: 100 + index,
          fileName: `batch-design-${index}.pdf`,
          mediaType: "application/pdf",
          organizationId,
          purpose: "internal_drawing",
          sourceId: `batch-design-${targetId}`,
          storageKey: `attachments/batch-design-${targetId}.pdf`,
          targetId,
          targetTable: "enquiry_items",
        })
      )
    )

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
      const grouped = await trackedRepository.listAttachmentsForTargets({
        organizationId,
        targetIds,
        targetTable: "enquiry_items",
      })

      expect(statementCount).toBe(1)
      expect(grouped.get(targetIds[0]!)).toEqual([
        expect.objectContaining({ fileName: "batch-design-0.pdf" }),
      ])
      expect(grouped.get(targetIds[1]!)).toEqual([
        expect.objectContaining({ fileName: "batch-design-1.pdf" }),
      ])
    } finally {
      await trackedRepository.close()
      await trackedPool.end()
    }
  })

  test("bounds operational enquiry and follow-up reads", async () => {
    const enquiries = await Promise.all(
      [0, 1].map((index) =>
        repository.createEnquiry({
          customerId,
          organizationId,
          receivedOn: `2026-08-0${index + 1}`,
          source: "Email",
        })
      )
    )
    await Promise.all(
      enquiries.map((enquiry, index) =>
        repository.createFollowup({
          dueOn: `2026-08-1${index + 1}`,
          enquiryId: enquiry.id,
          organizationId,
        })
      )
    )

    await expect(
      repository.listEnquiries(organizationCode, 1)
    ).resolves.toHaveLength(1)
    await expect(
      repository.listFollowups(organizationCode, 1)
    ).resolves.toHaveLength(1)
  })

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
        {
          rawValues: { part: exactCode, description: "Exact" },
          rowNumber: 1,
          status: "Unclassified",
        },
        {
          rawValues: { part: inProgressCode, description: "Work" },
          rowNumber: 2,
          status: "Unclassified",
        },
        {
          rawValues: {
            part: `${exactCode.slice(0, 6)}-REVIEW`,
            description: "Possible",
          },
          rowNumber: 3,
          status: "Unclassified",
        },
        {
          rawValues: {
            part: `DESC-${suffix}`,
            description: "Existing product",
          },
          rowNumber: 4,
          status: "Unclassified",
        },
        {
          rawValues: {
            part: `NEW-${suffix}`,
            description: "Brand new component",
          },
          rowNumber: 5,
          status: "Unclassified",
        },
        {
          rawValues: { part: "", description: "Missing part" },
          rowNumber: 6,
          status: "Unclassified",
        },
        {
          rawValues: {
            part: legacyQuoteUid,
            description: "Historical Q alias",
          },
          rowNumber: 7,
          status: "Unclassified",
        },
        {
          rawValues: { part: "", description: "" },
          rowNumber: 8,
          status: "Unclassified",
        },
      ],
    })

    expect(review.rows.map((row) => [row.status, row.suggestedAction])).toEqual(
      [
        ["Existing Quoted Match", "Commercial Requote"],
        ["In Progress Match", "Link to existing work"],
        ["Possible Match", "Review Manually"],
        ["Description Match - Sales Check", "Ask Sales"],
        ["New Line", "Add New Line"],
        ["Missing Information", "Skip"],
        ["Existing Quoted Match", "Commercial Requote"],
      ]
    )

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
    expect(applied.rows.filter((row) => row.createdEnquiryItemId)).toHaveLength(
      6
    )
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

    const technicalQueue =
      await repository.listTechnicalReviewQueueBounded("MRMPL")
    expect(
      technicalQueue.rows.some(
        (queueItem) => queueItem.enquiryItemId === line.id
      )
    ).toBe(false)

    const designQueue = await repository.listDesignQueueBounded("MRMPL")
    expect(
      designQueue.rows.some((queueItem) => queueItem.enquiryItemId === line.id)
    ).toBe(true)

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
      portfolioMatchStatus: "New Quoted Part",
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
    await repository.updateTechnicalReview({
      checklist: {
        drawing_available: true,
        drawing_information_complete: true,
        finish_plating_clear: true,
        grade_material_clear: true,
        packaging_clear: true,
        tooling_process_feasible: true,
      },
      enquiryItemId: snapshot.items[1]!.id,
      status: "Duplicate / Existing Product",
    })
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

  test("persists the full Design dossier and materializes a nested Package BOM", async () => {
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
      receivedOn: "2026-07-22",
      source: "Email",
    })
    const item = await repository.addEnquiryItem({
      customerPartCode: `PKG-${suffix}`,
      description: "Nested package",
      enquiryId: enquiry.id,
      organizationId,
      quantity: 2,
    })
    await repository.handOverToTechnicalReview(enquiry.id)
    await repository.updateTechnicalReview({
      checklist: {
        drawing_available: true,
        drawing_information_complete: true,
        finish_plating_clear: true,
        grade_material_clear: true,
        packaging_clear: true,
        tooling_process_feasible: true,
      },
      enquiryItemId: item.id,
      status: "Feasible",
    })
    await repository.requestDesignClarification({
      direction: "Design to Technical",
      enquiryItemId: item.id,
      message: "Confirm the package assembly boundary.",
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
      enquiryItemId: item.id,
      status: "Feasible",
      technicalRemarks: "Assembly boundary confirmed.",
    })

    const dossier = {
      approvalStatus: "Approved",
      assemblyRequired: "Yes",
      bomLines: [
        {
          componentCode: "",
          componentCategory: "Valve",
          componentItemType: "List",
          componentProductSize: "10mm",
          componentSource: "New",
          componentSubcategory: "Stem",
          lineNumber: 1,
          parentLineNumber: null,
          quantity: 1,
        },
        {
          componentCode: "",
          componentCategory: "Valve",
          componentItemType: "List",
          componentProductSize: "5mm",
          componentSource: "New",
          componentSubcategory: "Stem",
          lineNumber: 2,
          parentLineNumber: 1,
          pieceWeight: 5,
          quantity: 2,
        },
      ],
      checkedBy: "Design checker",
      componentsRequired: "Yes",
      designBomCompleted: "Yes",
      designBomRequired: "Yes",
      designRemarks: "Release after nested validation.",
      designStatus: "Design Complete",
      designerName: "Design owner",
      enquiryItemId: item.id,
      fixtureApproxCost: 12.5,
      fixtureRequired: "Yes",
      gaugesRequired: "Yes",
      inspectionApproxCost: 8.75,
      internalPartCategory: "Valve",
      internalPartSize: "10mm",
      internalPartSubCategory: "Stem",
      itemType: "Package",
      manufacturingProcess: "Assembly",
      operationNotes: "Machine, assemble, inspect.",
      packageProcessRequired: "Washing, Marking",
      portfolioMatchStatus: "New Quoted Part",
      quotedPartUid: null,
      revisionNo: "2",
      targetCompletionDate: "2026-08-05",
      toolingApproxCost: 25,
      toolingRequired: "Yes",
    }

    await expect(repository.saveDesign(dossier)).rejects.toThrow(
      "under an Assembly"
    )
    dossier.bomLines[0]!.componentItemType = "Assembly"
    const design = await repository.saveDesign(dossier)
    expect(design.quotedPartUid).toMatch(/^C\d+$/)
    await repository.recordAttachment({
      byteSize: 128,
      fileName: "internal-drawing.pdf",
      mediaType: "application/pdf",
      organizationId,
      purpose: "internal_drawing",
      sourceId: `design-file-${suffix}`,
      storageKey: `attachments/${suffix}/internal-drawing.pdf`,
      targetId: design.id,
      targetTable: "design_tasks",
    })
    await expect(
      repository.listAttachments({
        organizationId,
        purpose: "internal_drawing",
        targetId: design.id,
        targetTable: "design_tasks",
      })
    ).resolves.toEqual([
      expect.objectContaining({ fileName: "internal-drawing.pdf" }),
    ])
    expect(
      (await repository.listDesignQueue(organizationCode)).find(
        (row) => row.enquiryItemId === item.id
      )
    ).toMatchObject({
      approvalStatus: "Approved",
      designId: design.id,
      quotedPartUid: design.quotedPartUid,
    })

    const persisted = await pool.query<{
      approval_status: string
      assembly_required: string
      checked_by: string
      designer_name: string
      fixture_approx_cost: string
      inspection_approx_cost: string
      internal_part_name: string
      tooling_approx_cost: string
    }>(
      `
        SELECT approval_status, assembly_required, checked_by, designer_name,
          fixture_approx_cost::text, inspection_approx_cost::text,
          internal_part_name, tooling_approx_cost::text
        FROM sales.design_tasks
        WHERE id = $1
      `,
      [design.id]
    )
    expect(persisted.rows[0]).toMatchObject({
      approval_status: "Approved",
      assembly_required: "Yes",
      checked_by: "Design checker",
      designer_name: "Design owner",
      fixture_approx_cost: "12.500000",
      inspection_approx_cost: "8.750000",
      internal_part_name: "10mm Stem Valve",
      tooling_approx_cost: "25.000000",
    })
    const designBom = await pool.query<{
      component_item_type: string
      line_number: number
      package_part_uid: string
      parent_line_number: number | null
    }>(
      `
        SELECT component_item_type, line_number, package_part_uid,
          parent_line_number
        FROM sales.design_bom_lines
        WHERE design_task_id = $1
        ORDER BY line_number
      `,
      [design.id]
    )
    expect(designBom.rows[0]).toMatchObject({
      component_item_type: "Assembly",
      line_number: 1,
      parent_line_number: null,
    })
    expect(designBom.rows[0]!.package_part_uid).toMatch(/^A\d+$/)
    expect(designBom.rows[1]!.package_part_uid).toMatch(/^Q\d+$/)

    const prepared = await repository.prepareCostingFromDesign(item.id)
    expect(prepared).toMatchObject({
      nextStageStatus: "Product Costing",
      productUid: design.quotedPartUid,
    })
    const nestedBom = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM catalog.bom_lines child
        JOIN catalog.bom_lines parent
          ON parent.component_item_id = child.parent_item_id
        WHERE parent.parent_item_id = $1
      `,
      [prepared.productId]
    )
    expect(nestedBom.rows[0]!.count).toBe("1")
    const packageProduct = await pool.query<{
      machine_type: string | null
      process_required: string | null
      weight_100_pcs: string
    }>(
      `
        SELECT machine_type.name AS machine_type,
          item.source_payload ->> 'process_required' AS process_required,
          item.weight_100_pcs::text AS weight_100_pcs
        FROM catalog.items item
        LEFT JOIN catalog.machine_types machine_type
          ON machine_type.id = item.machine_type_id
        WHERE item.id = $1
      `,
      [prepared.productId]
    )
    expect(packageProduct.rows[0]).toEqual({
      machine_type: "Assembly",
      process_required: "Washing, Marking",
      weight_100_pcs: "10.000000",
    })
    await repository.requestDesignClarification({
      direction: "Product Costing to Design",
      enquiryItemId: item.id,
      message: "Revise the Assembly operation sequence.",
    })
    const reopened = await pool.query<{
      design_status: string
      next_stage_status: string
    }>(
      `
        SELECT design_status, next_stage_status
        FROM sales.design_tasks
        WHERE id = $1
      `,
      [design.id]
    )
    expect(reopened.rows[0]).toEqual({
      design_status: "Changes Required",
      next_stage_status: "Changes Required",
    })
  })

  test("preserves enquiry correction gates and drawing replacement history", async () => {
    const suffix = Date.now().toString(36)
    const enquiry = await repository.createEnquiry({
      buyerName: "Initial buyer",
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
      receivedOn: "2026-07-22",
      source: "Email",
    })

    await expect(
      repository.updateEnquiry({
        buyerName: "Updated buyer",
        customerId,
        enquiryId: enquiry.id,
        organizationId,
        priority: "High",
        remarks: "Register correction",
        source: "Portal",
      })
    ).resolves.toMatchObject({
      buyerName: "Updated buyer",
      priority: "High",
      source: "Portal",
    })

    const line = await repository.addEnquiryItem({
      customerPartCode: `CORR-${suffix}`,
      description: "Original description",
      enquiryId: enquiry.id,
      organizationId,
      quantity: 4,
    })
    await repository.handOverToTechnicalReview(enquiry.id)
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
      missingInformation: "Confirm drawing tolerance.",
      status: "Need Clarification",
    })

    const firstDrawing = await repository.recordAttachment({
      byteSize: 12,
      fileName: "drawing-r0.pdf",
      mediaType: "application/pdf",
      organizationId,
      sourceId: `drawing-r0-${suffix}`,
      storageKey: `attachments/${suffix}/drawing-r0.pdf`,
      targetId: line.id,
    })
    const replacementDrawing = await repository.recordAttachment({
      byteSize: 18,
      fileName: "drawing-r1.pdf",
      mediaType: "application/pdf",
      organizationId,
      sourceId: `drawing-r1-${suffix}`,
      storageKey: `attachments/${suffix}/drawing-r1.pdf`,
      targetId: line.id,
    })

    await expect(
      repository.updateEnquiryItem({
        actorUserId: null,
        customerPartCode: `CORR-${suffix}-R1`,
        description: "Corrected description",
        drawingReference: "DRG-R1",
        enquiryItemId: line.id,
        grade: "CW614N",
        quantity: 8,
        remarks: "Customer correction",
        targetPrice: 7.5,
      })
    ).resolves.toMatchObject({
      customerPartCode: `CORR-${suffix}-R1`,
      technicalReviewStatus: "Pending Review",
    })

    const correctionState = await pool.query<{
      open_sales_clarifications: string
      reviewed_at: Date | null
      technical_checklist: Record<string, boolean> | null
      technical_review_status: string
    }>(
      `
        SELECT enquiry_item.technical_review_status,
          enquiry_item.technical_checklist, enquiry_item.reviewed_at,
          count(clarification.id) FILTER (
            WHERE clarification.target_stage = 'Sales'
              AND clarification.status = 'Open'
          )::text AS open_sales_clarifications
        FROM sales.enquiry_items enquiry_item
        LEFT JOIN sales.clarification_tasks clarification
          ON clarification.enquiry_item_id = enquiry_item.id
        WHERE enquiry_item.id = $1
        GROUP BY enquiry_item.id
      `,
      [line.id]
    )
    expect(correctionState.rows[0]).toEqual({
      open_sales_clarifications: "0",
      reviewed_at: null,
      technical_checklist: {},
      technical_review_status: "Pending Review",
    })

    await expect(
      repository.getCurrentDrawing({
        enquiryItemId: line.id,
        organizationId,
      })
    ).resolves.toMatchObject({ id: replacementDrawing.id })
    await expect(
      repository.listDrawingHistory({
        enquiryItemId: line.id,
        organizationId,
      })
    ).resolves.toMatchObject([
      { id: replacementDrawing.id },
      { id: firstDrawing.id },
    ])

    await expect(repository.deleteEnquiry(enquiry.id)).rejects.toThrow(
      "cannot be deleted"
    )

    const disposable = await repository.createEnquiry({
      customerId,
      organizationId,
      receivedOn: "2026-07-22",
    })
    await expect(repository.deleteEnquiry(disposable.id)).resolves.toEqual({
      id: disposable.id,
    })
    await expect(repository.getEnquiry(disposable.id)).rejects.toThrow(
      "not found"
    )
  })

  test("preserves Sales match decisions, dedicated queues, and chained follow-ups", async () => {
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
      receivedOn: "2026-07-22",
    })
    const commercialLine = await repository.addEnquiryItem({
      customerPartCode: `DUP-${suffix}`,
      description: "Commercial match",
      enquiryId: enquiry.id,
      organizationId,
      quantity: 2,
    })
    const technicalLine = await repository.addEnquiryItem({
      customerPartCode: `REV-${suffix}`,
      description: "Technical revision",
      enquiryId: enquiry.id,
      organizationId,
      quantity: 3,
    })
    await repository.handOverToTechnicalReview(enquiry.id)
    for (const line of [commercialLine, technicalLine]) {
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
        missingInformation: "Sales decision required.",
        status: "Need Clarification",
      })
    }

    const quote = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.quote_items (
          organization_id, quote_number, revision, enquiry_id,
          enquiry_item_id, customer_id, item_id, lineage_item_id,
          customer_part_code, quantity, unit_price, currency_code,
          status, is_active, sent_at, price_lineage_key,
          source_system, source_table, source_id
        )
        VALUES (
          $1, $2, 1, $3, $4, $5, $6, $6, $7, 1, 25, 'USD',
          'Sent', true, now(), $8, 'test', 'quote_items', $9
        )
        RETURNING id
      `,
      [
        organizationId,
        `QT-SALES-${suffix}`,
        enquiry.id,
        commercialLine.id,
        customerId,
        existingProductId,
        `MATCH-${suffix}`,
        `sales-match:${suffix}`,
        `sales-match-${suffix}`,
      ]
    )

    const salesQueue =
      await repository.listSalesClarificationQueue(organizationCode)
    expect(
      salesQueue.filter((row) => row.enquiryId === enquiry.id)
    ).toHaveLength(2)
    const candidatePool = new Pool({ connectionString })
    const originalQuery = candidatePool.query.bind(candidatePool)
    let candidateStatements = 0
    candidatePool.query = ((
      ...args: Parameters<typeof candidatePool.query>
    ) => {
      candidateStatements += 1
      return originalQuery(...args)
    }) as typeof candidatePool.query
    const candidateRepository = createCommercialWorkflowRepository({
      pool: candidatePool,
    })
    try {
      const candidates =
        await candidateRepository.listSalesMatchCandidatesForItems([
          commercialLine.id,
          technicalLine.id,
        ])

      expect(candidateStatements).toBe(1)
      for (const line of [commercialLine, technicalLine]) {
        expect(candidates.get(line.id)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ quoteItemId: quote.rows[0]!.id }),
          ])
        )
      }
    } finally {
      await candidateRepository.close()
      await candidatePool.end()
    }
    expect(
      (await repository.listTechnicalReviewQueue(organizationCode)).some(
        (row) => row.enquiryId === enquiry.id
      )
    ).toBe(false)

    const snapshot = await repository.getEnquiry(enquiry.id)
    const clarificationFor = (lineId: string) =>
      snapshot.clarifications.find(
        (clarification) => clarification.enquiryItemId === lineId
      )!
    await repository.completeSalesClarification({
      clarificationTaskId: clarificationFor(commercialLine.id).id,
      customerPartCode: `DUP-${suffix}-CONFIRMED`,
      description: "Commercial match confirmed",
      enquiryItemId: commercialLine.id,
      quantity: 5,
      response: "Use the sent commercial item.",
      salesMatchDecision: `quote:${quote.rows[0]!.id}`,
      targetPrice: 24,
    })
    await repository.completeSalesClarification({
      clarificationTaskId: clarificationFor(technicalLine.id).id,
      customerPartCode: `REV-${suffix}-CONFIRMED`,
      description: "Technical revision confirmed",
      enquiryItemId: technicalLine.id,
      quantity: 6,
      response: "Dimensions changed; review again.",
      salesMatchDecision: `technical:${quote.rows[0]!.id}`,
      targetPrice: 28,
    })

    const matchStates = await pool.query<{
      design_status: string | null
      enquiry_item_id: string
      link_type: string | null
      matched_product_id: string | null
      next_stage_status: string | null
      revision_type: string | null
      technical_review_status: string
    }>(
      `
        SELECT enquiry_item.id AS enquiry_item_id,
          enquiry_item.technical_review_status, enquiry_item.link_type,
          enquiry_item.revision_type, design.design_status,
          design.matched_product_id, design.next_stage_status
        FROM sales.enquiry_items enquiry_item
        LEFT JOIN sales.design_tasks design
          ON design.enquiry_item_id = enquiry_item.id
        WHERE enquiry_item.id = ANY($1::uuid[])
        ORDER BY enquiry_item.id
      `,
      [[commercialLine.id, technicalLine.id]]
    )
    expect(matchStates.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          design_status: "Not Required",
          enquiry_item_id: commercialLine.id,
          link_type: "Matched Quote - Commercial Requote",
          matched_product_id: existingProductId,
          next_stage_status: "Product Costing Complete",
          technical_review_status: "Duplicate / Existing Product",
        }),
        expect.objectContaining({
          enquiry_item_id: technicalLine.id,
          link_type: "Matched Quote - Technical Revision",
          revision_type: "Technical Revision",
          technical_review_status: "Pending Review",
        }),
      ])
    )
    expect(
      (await repository.listTechnicalReviewQueue(organizationCode)).some(
        (row) => row.enquiryItemId === technicalLine.id
      )
    ).toBe(true)

    const followup = await repository.createFollowup({
      channel: "Phone",
      dueOn: "2026-07-23",
      enquiryId: enquiry.id,
      note: "Call the buyer.",
      organizationId,
      quoteItemId: quote.rows[0]!.id,
    })
    const completed = await repository.completeFollowup({
      channel: "Email",
      followupId: followup.id,
      nextDueOn: "2026-07-30",
      nextNote: "Send the revised drawing.",
      note: "Buyer contacted.",
      status: "Completed",
    })
    expect(completed).toMatchObject({
      id: followup.id,
      status: "Completed",
      nextFollowupId: expect.any(String),
    })
    await expect(repository.listFollowups(organizationCode)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enquiryId: enquiry.id,
          id: completed.nextFollowupId,
          status: "Pending",
        }),
        expect.objectContaining({
          enquiryId: enquiry.id,
          id: followup.id,
          status: "Completed",
        }),
      ])
    )
  })

  test("imports enquiry register creates and gated updates atomically", async () => {
    const artifactCountBefore = (
      await artifactReader.listByOrganization({ organizationId })
    ).length
    const existing = await repository.createEnquiry({
      customerId,
      organizationId,
      receivedOn: "2026-07-22",
      source: "Email",
    })
    const customer = await pool.query<{ customer_uid: string }>(
      "SELECT customer_uid FROM sales.customers WHERE id = $1",
      [customerId]
    )
    await expect(
      repository.importEnquiryRegister({
        organizationId,
        receivedOn: "2026-07-22",
        rows: [
          {
            buyerName: "Imported buyer",
            customerUid: customer.rows[0]!.customer_uid,
            enquiryNumber: existing.enquiryNumber,
            priority: "High",
            remarks: "Updated from register",
            rowNumber: 2,
            source: "Portal",
          },
          {
            customerName: "Workflow Customer",
            priority: "Normal",
            rowNumber: 3,
            source: "Email",
          },
        ],
      })
    ).resolves.toEqual({ createdCount: 1, updatedCount: 1 })
    await expect(repository.getEnquiry(existing.id)).resolves.toMatchObject({
      enquiry: {
        buyerName: "Imported buyer",
        priority: "High",
        remarks: "Updated from register",
        source: "Portal",
      },
    })

    const afterFirstImport = (await repository.listEnquiries(organizationCode))
      .length
    await expect(
      repository.importEnquiryRegister({
        organizationId,
        receivedOn: "2026-07-22",
        rows: [
          {
            customerName: "Workflow Customer",
            priority: "Normal",
            rowNumber: 9,
            source: "Email",
          },
        ],
      })
    ).resolves.toEqual({ createdCount: 0, updatedCount: 1 })
    expect((await repository.listEnquiries(organizationCode)).length).toBe(
      afterFirstImport
    )

    const before = (await repository.listEnquiries(organizationCode)).length
    await expect(
      repository.importEnquiryRegister({
        organizationId,
        receivedOn: "2026-07-22",
        rows: [
          {
            customerUid: customer.rows[0]!.customer_uid,
            rowNumber: 2,
          },
          {
            customerUid: customer.rows[0]!.customer_uid,
            enquiryNumber: "ENQ-UNKNOWN",
            rowNumber: 3,
          },
        ],
      })
    ).rejects.toThrow("references unknown ENQ")
    expect((await repository.listEnquiries(organizationCode)).length).toBe(
      before
    )
    const artifactCountAfter = (
      await artifactReader.listByOrganization({ organizationId })
    ).length
    expect(artifactCountAfter).toBe(artifactCountBefore)
  })
})
