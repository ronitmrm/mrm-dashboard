import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  bulkRevisionFields,
  createCommercialRevisionsRepository,
} from "./commercial-revisions"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialRevisionsRepository({ connectionString })
let organizationId: string
let customerId: string

async function createItem(uid: string, itemType: string) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        item_type, source_system, source_table, source_id
      )
      VALUES ($1, $2, 'INTERNAL', 'P', $2, $3, 'test', 'items', $4)
      RETURNING id
    `,
    [organizationId, uid, itemType, randomUUID()]
  )
  return result.rows[0]!.id
}

async function createQuote(input: {
  child?: { itemId: string; quoteItemId: string; total: number }
  customerPartCode?: string | null
  itemId: string
  itemType: string
  processBase: number
  profitPercent: number
  total: number
}) {
  const sourceId = randomUUID()
  const quote = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.quote_items (
        organization_id, quote_number, revision, customer_id, item_id,
        lineage_item_id, customer_part_code, quantity, unit_price,
        currency_code, status, is_active, sent_at, profit_percent,
        conversion_rate, rate_inr, total_rate_inr, rate_usd,
        approved_price_usd, calculation_json, price_lineage_key,
        source_system, source_table, source_id
      )
      VALUES (
        $1, $2, 1, $3, $4, $4, $5, 1, $6, 'USD', 'Draft', true, NULL,
        $7, 1, $6, $6, $6, $6, $8, $9, 'test', 'quote_items', $10
      )
      RETURNING id
    `,
    [
      organizationId,
      `REV-${sourceId}`,
      customerId,
      input.itemId,
      input.customerPartCode ?? null,
      input.total,
      input.profitPercent,
      {
        childQuoteTotal: input.child?.total ?? 0,
        packageProcessCostPerPiece: input.processBase,
        profitB: input.processBase * input.profitPercent,
        rejectionCost: 0,
        totalA: input.processBase,
        totalRateInr: input.total,
      },
      `revision:${sourceId}`,
      sourceId,
    ]
  )
  const snapshot = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.quote_product_snapshots (
        organization_id, quote_item_id, item_uid, description, item_type,
        production_type, weight_100_pcs, pieces_per_kg, material_rate,
        material_cost, conversion_cost, packaging_cost, shipping_cost,
        overhead_cost, rejection_cost, total_cost, quoted_price,
        calculation_version, product_snapshot, calculation_json,
        source_system, source_table, source_id
      )
      SELECT
        $1, $2, item.uid, item.description, item.item_type,
        item.production_type, item.weight_100_pcs, item.pieces_per_kg,
        0, 0, $3, 0, 0, 0, 0, $4, $4, 'revision-test-v1',
        jsonb_build_object(
          'itemType', item.item_type,
          'rejectionPercent', 0,
          'uid', item.uid
        ),
        $5, 'test', 'quote_product_snapshots', $6
      FROM catalog.items item
      WHERE item.id = $7
      RETURNING id
    `,
    [
      organizationId,
      quote.rows[0]!.id,
      input.processBase,
      input.total,
      {
        childQuoteTotal: input.child?.total ?? 0,
        packageProcessCostPerPiece: input.processBase,
        totalRateInr: input.total,
      },
      randomUUID(),
      input.itemId,
    ]
  )
  if (input.child) {
    await pool.query(
      `
        INSERT INTO sales.quote_package_components (
          organization_id, quote_product_snapshot_id, component_item_id,
          component_uid, description, quantity, unit_cost, extended_cost,
          sequence, child_quote_item_id, source_system, source_table, source_id
        )
        SELECT $1, $2, item.id, item.uid, item.description, 1, $3, $3, 0,
          $4, 'test', 'quote_package_components', $5
        FROM catalog.items item
        WHERE item.id = $6
      `,
      [
        organizationId,
        snapshot.rows[0]!.id,
        input.child.total,
        input.child.quoteItemId,
        randomUUID(),
        input.child.itemId,
      ]
    )
  }
  await pool.query(
    `
      UPDATE sales.quote_items
      SET status = 'Sent', sent_at = now()
      WHERE id = $1
    `,
    [quote.rows[0]!.id]
  )
  return quote.rows[0]!.id
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ('MRMPL', 'MRM Private Limited')
      ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
  )
  organizationId = organization.rows[0]!.id
  const customer = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, status,
        source_system, source_table, source_id
      )
      VALUES ($1, $2, 'Revision Contract Customer', 'Active',
        'test', 'customers', $3)
      RETURNING id
    `,
    [organizationId, `REV-${randomUUID()}`, randomUUID()]
  )
  customerId = customer.rows[0]!.id
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("commercial revisions and corrections", () => {
  test("publishes the exact source customer and product bulk field matrix", () => {
    expect(Object.keys(bulkRevisionFields)).toEqual([
      "casting",
      "scrap_rate",
      "alloy_premium",
      "ext_cost",
      "forging_cost",
      "machining_cost",
      "washing",
      "checking",
      "marking",
      "plating",
      "annealing",
      "deburring",
      "buffing",
      "sealant",
      "assembly_operation_cost",
      "packing_cost",
      "shipping_cost",
      "overhead_cost",
      "purchase_times",
      "profit_percent",
      "conversion_rate",
    ])
    expect(bulkRevisionFields.profit_percent.valueType).toBe("percent")
    expect(bulkRevisionFields.scrap_rate.valueType).toBe("number")
  })

  test("lists engineering change notes for an organization with no ECNs", async () => {
    await expect(
      repository.listEngineeringChangeNotes("MRMPL")
    ).resolves.toEqual([])
  })

  test("revises a child and every active nested parent without rewriting history", async () => {
    const leafId = await createItem(`M${Date.now()}1`, "List")
    const assemblyId = await createItem(`A-${randomUUID()}`, "Assembly")
    const packageId = await createItem(`P-${randomUUID()}`, "Package")
    const leafQuoteId = await createQuote({
      itemId: leafId,
      itemType: "List",
      processBase: 10,
      profitPercent: 0.2,
      total: 12,
    })
    const assemblyQuoteId = await createQuote({
      child: { itemId: leafId, quoteItemId: leafQuoteId, total: 12 },
      itemId: assemblyId,
      itemType: "Assembly",
      processBase: 2,
      profitPercent: 0.1,
      total: 14.2,
    })
    const packageQuoteId = await createQuote({
      child: {
        itemId: assemblyId,
        quoteItemId: assemblyQuoteId,
        total: 14.2,
      },
      customerPartCode: `NESTED-${randomUUID()}`,
      itemId: packageId,
      itemType: "Package",
      processBase: 1,
      profitPercent: 0.1,
      total: 15.3,
    })
    const before = await pool.query<{ digest: string }>(
      `
        SELECT md5(
          string_agg(
            snapshot.id::text || ':' || snapshot.calculation_json::text,
            ',' ORDER BY snapshot.id
          )
        ) AS digest
        FROM sales.quote_product_snapshots snapshot
        WHERE snapshot.quote_item_id = ANY($1::uuid[])
      `,
      [[leafQuoteId, assemblyQuoteId, packageQuoteId]]
    )

    const revision = await repository.createBulkPriceRevision({
      customerId,
      effectiveOn: "2026-07-21",
      organizationId,
      reason: "Raise leaf profit for contract coverage",
      revisionRoute: "Customer Parameter Bulk Revision",
    })
    await repository.stageBulkPriceRevisionChange({
      bulkPriceRevisionId: revision.id,
      fieldName: "profit_percent",
      newValue: 0.3,
      selectedQuoteItemIds: [leafQuoteId],
    })
    const completed = await repository.completeBulkPriceRevision({
      bulkPriceRevisionId: revision.id,
    })
    expect(completed).toMatchObject({
      revisedQuoteCount: 3,
      status: "Completed",
    })

    const replacements = await pool.query<{
      approved_price_usd: string
      prior_quote_item_id: string
      replacement_quote_item_id: string
    }>(
      `
        SELECT change.prior_quote_item_id, change.replacement_quote_item_id,
          quote.approved_price_usd
        FROM sales.bulk_price_revision_changes change
        JOIN sales.quote_items quote
          ON quote.id = change.replacement_quote_item_id
        WHERE change.bulk_price_revision_id = $1
        ORDER BY quote.approved_price_usd
      `,
      [revision.id]
    )
    expect(
      replacements.rows.map((row) => Number(row.approved_price_usd))
    ).toEqual([13, 15.2, 16.3])
    expect(
      new Set(replacements.rows.map((row) => row.prior_quote_item_id))
    ).toEqual(new Set([leafQuoteId, assemblyQuoteId, packageQuoteId]))
    const after = await pool.query<{ digest: string }>(
      `
        SELECT md5(
          string_agg(
            snapshot.id::text || ':' || snapshot.calculation_json::text,
            ',' ORDER BY snapshot.id
          )
        ) AS digest
        FROM sales.quote_product_snapshots snapshot
        WHERE snapshot.quote_item_id = ANY($1::uuid[])
      `,
      [[leafQuoteId, assemblyQuoteId, packageQuoteId]]
    )
    expect(after.rows[0]!.digest).toBe(before.rows[0]!.digest)
  })

  test("uses the source bulk matrices, process guards, grouped selection, previews, and staged deletion", async () => {
    const suffix = randomUUID()
    const inspectionItemId = await createItem(`M-BULK-${suffix}`, "List")
    const plainItemId = await createItem(`M-PLAIN-${suffix}`, "List")
    await pool.query(
      "UPDATE catalog.items SET remarks = 'Quality inspection required' WHERE id = $1",
      [inspectionItemId]
    )
    const inspectionQuoteId = await createQuote({
      itemId: inspectionItemId,
      itemType: "List",
      processBase: 10,
      profitPercent: 0.2,
      total: 12,
    })
    const plainQuoteId = await createQuote({
      itemId: plainItemId,
      itemType: "List",
      processBase: 10,
      profitPercent: 0.2,
      total: 12,
    })
    const revision = await repository.createBulkPriceRevision({
      effectiveOn: "2026-07-22",
      organizationId,
      reason: "Characterize source product-field selection",
      revisionRoute: "Product Parameter Bulk Revision",
    })

    await expect(
      repository.stageBulkPriceRevisionChange({
        bulkPriceRevisionId: revision.id,
        fieldName: "profit_percent",
        newValue: 0.3,
        selectedQuoteItemIds: [inspectionQuoteId],
      })
    ).rejects.toThrow("product-level")
    const staged = await repository.stageBulkPriceRevisionChange({
      bulkPriceRevisionId: revision.id,
      fieldName: "checking",
      newValue: 7,
      selectedQuoteItemIds: [inspectionQuoteId, plainQuoteId],
    })
    expect(staged).toMatchObject({ selectedCount: 1, skippedCount: 1 })
    expect(staged.stageGroupId).toBeTruthy()

    const stages = await repository.listBulkPriceRevisionStages(revision.id)
    expect(stages).toEqual([
      expect.objectContaining({
        fieldName: "checking",
        fieldLabel: "Checking (INR/kg)",
        previewRows: [
          expect.objectContaining({
            oldPrice: 12,
            quoteItemId: inspectionQuoteId,
          }),
        ],
        selectedCount: 1,
        stageGroupId: staged.stageGroupId,
      }),
    ])
    await expect(
      repository.deleteBulkPriceRevisionStage({
        bulkPriceRevisionId: revision.id,
        stageGroupId: staged.stageGroupId,
      })
    ).resolves.toMatchObject({ deletedCount: 1 })
    await expect(
      repository.completeBulkPriceRevision({
        bulkPriceRevisionId: revision.id,
      })
    ).rejects.toThrow("at least one")
  })

  test("runs ECN through Design, Product Costing, Costing, and completion with BOM evidence", async () => {
    const suffix = randomUUID()
    const firstComponentId = await createItem(`M-ECN-A-${suffix}`, "List")
    const secondComponentId = await createItem(`M-ECN-B-${suffix}`, "List")
    const packageId = await createItem(`P-ECN-${suffix}`, "Package")
    await pool.query(
      `
        INSERT INTO catalog.bom_lines (
          organization_id, parent_item_id, component_item_id, quantity,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, 1, 'test', 'bom_lines', $4)
      `,
      [organizationId, packageId, firstComponentId, randomUUID()]
    )
    const ecn = await repository.createEngineeringChangeNote({
      effectiveOn: "2026-07-22",
      itemId: packageId,
      organizationId,
      reason: "Replace package component and recost",
    })
    const designed = await repository.completeEngineeringChangeDesign({
      engineeringChangeNoteId: ecn.id,
      itemPatch: {
        bomLines: [
          {
            componentItemId: secondComponentId,
            notes: "ECN replacement",
            quantity: 2,
          },
        ],
        description: "Revised ECN package",
        remarks: "Package process: assembly",
      },
    })
    expect(designed.status).toBe("Pending Product Costing")
    const designEvidence = await pool.query<{
      design_after: Record<string, unknown>
      design_before: Record<string, unknown>
    }>(
      "SELECT design_before, design_after FROM sales.engineering_change_notes WHERE id = $1",
      [ecn.id]
    )
    expect(designEvidence.rows[0]!.design_before).toHaveProperty("bomLines")
    expect(designEvidence.rows[0]!.design_after).toMatchObject({
      item: { description: "Revised ECN package" },
    })

    const costed = await repository.completeEngineeringChangeProductCosting({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { assemblyOperationCost: 25 },
    })
    expect(costed.status).toBe("Completed")
    const stored = await pool.query<{
      assembly_operation_cost: string
      status: string
    }>(
      `
        SELECT item.assembly_operation_cost, ecn.status
        FROM sales.engineering_change_notes ecn
        JOIN catalog.items item ON item.id = ecn.item_id
        WHERE ecn.id = $1
      `,
      [ecn.id]
    )
    expect(Number(stored.rows[0]!.assembly_operation_cost)).toBe(25)
    expect(stored.rows[0]!.status).toBe("Completed")
  })

  test("freezes ECN affected prices and preserves Keep Price Same semantics", async () => {
    const suffix = randomUUID()
    const itemId = await createItem(`M-ECN-PRICE-${suffix}`, "List")
    await pool.query(
      `
        UPDATE catalog.items
        SET weight_100_pcs = 10, casting = 1, machining_cost = 100
        WHERE id = $1
      `,
      [itemId]
    )
    const quoteItemId = await createQuote({
      customerPartCode: `ECN-KEEP-${suffix}`,
      itemId,
      itemType: "List",
      processBase: 100,
      profitPercent: 0.2,
      total: 120,
    })
    const ecn = await repository.createEngineeringChangeNote({
      itemId,
      organizationId,
      reason: "Machine cost changed",
    })
    await repository.completeEngineeringChangeDesign({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { description: `Revised ${suffix}` },
    })
    const costing = await repository.completeEngineeringChangeProductCosting({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { machiningCost: 140 },
    })
    expect(costing).toMatchObject({
      affectedPriceCount: 1,
      status: "Pending Costing",
    })
    const affected = await repository.listEngineeringChangeAffectedPrices(
      ecn.id
    )
    expect(affected).toEqual([
      expect.objectContaining({
        keepSamePriceUsd: 120,
        quoteItemId,
      }),
    ])
    const decision = await repository.applyEngineeringChangeDecision({
      decision: "Keep Price Same",
      engineeringChangeNoteId: ecn.id,
      sourceQuoteItemId: quoteItemId,
    })
    expect(decision).toMatchObject({ newPrice: 120, status: "Completed" })
  })

  test("records ECN decisions against recursive active customer prices", async () => {
    const itemId = await createItem(`M${Date.now()}2`, "List")
    const quoteItemId = await createQuote({
      customerPartCode: `ECN-${randomUUID()}`,
      itemId,
      itemType: "List",
      processBase: 8,
      profitPercent: 0.25,
      total: 10,
    })
    const ecn = await repository.createEngineeringChangeNote({
      effectiveOn: "2026-07-21",
      itemId,
      organizationId,
      reason: "Drawing dimension changed",
    })
    await repository.completeEngineeringChangeDesign({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { description: "Revised drawing product" },
    })
    await repository.completeEngineeringChangeProductCosting({
      engineeringChangeNoteId: ecn.id,
      itemPatch: {},
    })
    const affected = await repository.listEngineeringChangeAffectedPrices(
      ecn.id
    )
    expect(affected.map((price) => price.quoteItemId)).toContain(quoteItemId)
    const decision = await repository.applyEngineeringChangeDecision({
      decision: "Keep Price Same",
      engineeringChangeNoteId: ecn.id,
      sourceQuoteItemId: quoteItemId,
    })
    expect(decision).toMatchObject({ newPrice: 10, status: "Completed" })
    expect(decision.replacementQuoteItemId).not.toBe(quoteItemId)
  })

  test("keeps correction requests append-only and visibly quarantined", async () => {
    const target = await pool.query<{ id: string }>(
      "SELECT id FROM sales.quote_items WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1",
      [organizationId]
    )
    const otherOrganization = await pool.query<{ id: string }>(
      `
        INSERT INTO core.organizations (code, name)
        VALUES ($1, 'Other correction organization')
        RETURNING id
      `,
      [`CORR-${randomUUID()}`]
    )
    await expect(
      repository.recordPricingCorrection({
        organizationId: otherOrganization.rows[0]!.id,
        reason: "Cross-organization hidden input",
        requestedAction: "Rewrite sent quote",
        targetId: target.rows[0]!.id,
        targetTable: "quote_items",
      })
    ).rejects.toThrow("organization")
    const correction = await repository.recordPricingCorrection({
      organizationId,
      reason: "Operator requested a destructive historical price edit",
      requestedAction: "Rewrite sent quote",
      targetId: target.rows[0]!.id,
      targetTable: "quote_items",
    })
    expect(correction.status).toBe("Quarantined")
    const stored = await pool.query<{ status: string }>(
      "SELECT status FROM audit.pricing_correction_requests WHERE id = $1",
      [correction.id]
    )
    expect(stored.rows[0]!.status).toBe("Quarantined")
  })

  test("reverses only a just-started Design-to-Costing handoff", async () => {
    const suffix = randomUUID()
    const enquiry = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiries (
          organization_id, enquiry_number, customer_id, received_on, status,
          conversion_rate, technical_handover_status, source_system,
          source_table, source_id
        )
        VALUES (
          $1, $2, $3, '2026-07-21', 'Logged', 80, 'Handed Over',
          'test', 'enquiries', $4
        )
        RETURNING id
      `,
      [organizationId, `ENQ-CORR-${suffix}`, customerId, suffix]
    )
    const enquiryItem = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.enquiry_items (
          organization_id, enquiry_id, line_number, customer_part_code,
          description, quantity, technical_review_status, source_system,
          source_table, source_id
        )
        VALUES (
          $1, $2, 1, $3, 'Correction candidate', 1, 'Feasible',
          'test', 'enquiry_items', $4
        )
        RETURNING id
      `,
      [organizationId, enquiry.rows[0]!.id, `CORR-${suffix}`, suffix]
    )
    const designTask = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.design_tasks (
          organization_id, enquiry_item_id, status, design_status,
          next_stage_status, quoted_part_uid, source_system, source_table,
          source_id
        )
        VALUES (
          $1, $2, 'Complete', 'Design Complete', 'Started', $3,
          'test', 'design_tasks', $4
        )
        RETURNING id
      `,
      [organizationId, enquiryItem.rows[0]!.id, `Q-${suffix}`, suffix]
    )

    await expect(
      repository.reverseDesignCostingHandoff({
        designTaskId: designTask.rows[0]!.id,
        remarks: "Started against the wrong design revision",
      })
    ).resolves.toMatchObject({ nextStageStatus: "Not Started" })
    await expect(
      repository.reverseDesignCostingHandoff({
        designTaskId: designTask.rows[0]!.id,
      })
    ).rejects.toThrow("just-started")

    const audit = await pool.query<{
      after_state: Record<string, unknown>
      before_state: Record<string, unknown>
      event_type: string
    }>(
      `
        SELECT event_type, before_state, after_state
        FROM audit.events
        WHERE target_id = $1
          AND event_type = 'pricing_correction.design_costing_handoff_reversed'
      `,
      [enquiryItem.rows[0]!.id]
    )
    expect(audit.rows[0]).toMatchObject({
      after_state: { nextStageStatus: "Not Started" },
      before_state: { nextStageStatus: "Started" },
    })
    const register = await repository.listPricingCorrections("MRMPL")
    expect(register).toContainEqual(
      expect.objectContaining({
        requestedAction: "Reverse Costing Handoff",
        status: "Applied",
        targetId: enquiryItem.rows[0]!.id,
      })
    )
  })

  test("deletes only unused quoted product entries and their parent BOM", async () => {
    const suffix = randomUUID()
    const componentId = await createItem(`M-CORR-${suffix}`, "List")
    const candidate = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          item_type, source_system, source_table, source_id
        )
        VALUES (
          $1, $2, 'QUOTE', 'Q', 'Unused quoted product', 'Package',
          'test', 'items', $3
        )
        RETURNING id
      `,
      [organizationId, `Q-CORR-${suffix}`, suffix]
    )
    await pool.query(
      `
        INSERT INTO catalog.bom_lines (
          organization_id, parent_item_id, component_item_id, quantity,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, 1, 'test', 'bom_lines', $4)
      `,
      [organizationId, candidate.rows[0]!.id, componentId, suffix]
    )

    await expect(
      repository.reverseProductEntry({ itemId: candidate.rows[0]!.id })
    ).resolves.toMatchObject({ deleted: true })
    const deleted = await pool.query<{ bom_count: string; item_count: string }>(
      `
        SELECT
          (SELECT count(*)::text FROM catalog.bom_lines
            WHERE parent_item_id = $1) AS bom_count,
          (SELECT count(*)::text FROM catalog.items
            WHERE id = $1) AS item_count
      `,
      [candidate.rows[0]!.id]
    )
    expect(deleted.rows[0]).toEqual({ bom_count: "0", item_count: "0" })

    const blocked = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          item_type, source_system, source_table, source_id
        )
        VALUES (
          $1, $2, 'QUOTE', 'Q', 'Quoted blocker', 'List',
          'test', 'items', $3
        )
        RETURNING id
      `,
      [organizationId, `Q-BLOCK-${suffix}`, randomUUID()]
    )
    const blockedItemId = blocked.rows[0]!.id
    await createQuote({
      itemId: blockedItemId,
      itemType: "List",
      processBase: 1,
      profitPercent: 0.1,
      total: 1.1,
    })
    await expect(
      repository.reverseProductEntry({ itemId: blockedItemId })
    ).rejects.toThrow("quote")
    const candidates = await repository.listCorrectionCandidates("MRMPL")
    expect(candidates.products).toContainEqual(
      expect.objectContaining({
        blockerCounts: expect.objectContaining({ quotes: 1 }),
        canReverse: false,
        id: blockedItemId,
      })
    )
  })
})
