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
let organizationCode: string
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
  customerId?: string
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
      input.customerId ?? customerId,
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
  organizationCode = `REV-${randomUUID()}`
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'Revision Test Organization')
      RETURNING id
    `,
    [organizationCode]
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

  test("bounds the customer bulk revision queue and searches only its active customer prices", async () => {
    const suffix = randomUUID()
    const firstItemId = await createItem(`M-CBR-A-${suffix}`, "List")
    const secondItemId = await createItem(`M-CBR-B-${suffix}`, "List")
    const firstQuoteId = await createQuote({
      customerPartCode: `CBR-A-${suffix}`,
      itemId: firstItemId,
      itemType: "List",
      processBase: 10,
      profitPercent: 0.2,
      total: 12,
    })
    await createQuote({
      customerPartCode: `CBR-B-${suffix}`,
      itemId: secondItemId,
      itemType: "List",
      processBase: 11,
      profitPercent: 0.2,
      total: 13.2,
    })
    const firstRevision = await repository.createBulkPriceRevision({
      customerId,
      effectiveOn: "2026-08-21",
      organizationId,
      reason: "First bounded customer revision",
      revisionRoute: "Customer Parameter Bulk Revision",
    })
    await repository.createBulkPriceRevision({
      customerId,
      effectiveOn: "2026-08-22",
      organizationId,
      reason: "Second bounded customer revision",
      revisionRoute: "Customer Parameter Bulk Revision",
    })
    const productRevision = await repository.createBulkPriceRevision({
      effectiveOn: "2026-08-23",
      organizationId,
      reason: "Product revisions stay outside the customer-only queue",
      revisionRoute: "Product Parameter Bulk Revision",
    })

    const queue = await repository.listCustomerBulkPriceRevisionsBounded(
      organizationCode,
      { limit: 1 }
    )
    expect(queue.coverage).toEqual({
      limit: 1,
      returned: 1,
      total: 2,
      truncated: true,
    })
    expect(queue.rows[0]).toMatchObject({
      activePriceCount: 2,
      revisionRoute: "Customer Parameter Bulk Revision",
    })

    const prices = await repository.listBulkPriceRevisionActivePricesBounded(
      firstRevision.id,
      { limit: 1, query: `CBR-A-${suffix}` }
    )
    expect(prices).toEqual({
      coverage: { limit: 1, returned: 1, total: 1, truncated: false },
      rows: [
        expect.objectContaining({
          customerPartCode: `CBR-A-${suffix}`,
          id: firstQuoteId,
        }),
      ],
    })

    await pool.query(
      "UPDATE sales.bulk_price_revisions SET status = 'Pending Customer Costing' WHERE id = $1",
      [productRevision.id]
    )
    const customerStageQueue =
      await repository.listCustomerBulkPriceRevisionsBounded(organizationCode)
    expect(customerStageQueue.coverage.total).toBe(3)
    expect(customerStageQueue.rows).toContainEqual(
      expect.objectContaining({
        id: productRevision.id,
        revisionRoute: "Product Parameter Bulk Revision",
        status: "Pending Customer Costing",
      })
    )
    const customerStage = await repository.stageBulkPriceRevisionChange({
      bulkPriceRevisionId: productRevision.id,
      fieldName: "profit_percent",
      newValue: 0.25,
      selectedQuoteItemIds: [firstQuoteId],
    })
    expect(customerStage).toMatchObject({ selectedCount: 1 })
    await pool.query(
      "UPDATE sales.bulk_price_revision_changes SET applied_at = now() WHERE stage_group_id = $1",
      [customerStage.stageGroupId]
    )
    await expect(
      repository.deleteBulkPriceRevisionStage({
        bulkPriceRevisionId: productRevision.id,
        stageGroupId: customerStage.stageGroupId,
      })
    ).rejects.toThrow("not found")
  })

  test("hands a product bulk revision to customer costing before revising every active customer price", async () => {
    const suffix = randomUUID()
    const sharedItemId = await createItem(`M-PBR-${suffix}`, "List")
    await pool.query(
      "UPDATE catalog.items SET overhead_cost = 1 WHERE id = $1",
      [sharedItemId]
    )
    const secondCustomer = await pool.query<{ id: string }>(
      `
        INSERT INTO sales.customers (
          organization_id, customer_uid, company_name, status,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, 'Second Product Revision Customer', 'Active',
          'test', 'customers', $3)
        RETURNING id
      `,
      [organizationId, `PBR-${suffix}`, randomUUID()]
    )
    const firstQuoteId = await createQuote({
      customerPartCode: `PBR-A-${suffix}`,
      itemId: sharedItemId,
      itemType: "List",
      processBase: 10,
      profitPercent: 0.2,
      total: 12,
    })
    const secondQuoteId = await createQuote({
      customerId: secondCustomer.rows[0]!.id,
      customerPartCode: `PBR-B-${suffix}`,
      itemId: sharedItemId,
      itemType: "List",
      processBase: 10,
      profitPercent: 0.2,
      total: 12,
    })
    const revision = await repository.createBulkPriceRevision({
      effectiveOn: "2026-08-21",
      organizationId,
      reason: "Raise shared overhead before customer recosting",
      revisionRoute: "Product Parameter Bulk Revision",
    })

    const productQueue =
      await repository.listProductBulkPriceRevisionsBounded(organizationCode)
    expect(productQueue.rows).toContainEqual(
      expect.objectContaining({
        activePriceCount: 2,
        id: revision.id,
        status: "Pending Costing",
      })
    )
    const productPrices =
      await repository.listProductBulkRevisionActivePricesBounded(revision.id)
    expect(new Set(productPrices.rows.map((price) => price.id))).toEqual(
      new Set([firstQuoteId, secondQuoteId])
    )

    await expect(
      repository.stageBulkPriceRevisionChange({
        bulkPriceRevisionId: revision.id,
        fieldName: "overhead_cost",
        newValue: 4,
        selectedQuoteItemIds: [firstQuoteId],
      })
    ).resolves.toMatchObject({ selectedCount: 1, skippedCount: 0 })
    await expect(
      repository.completeBulkPriceRevision({
        bulkPriceRevisionId: revision.id,
      })
    ).resolves.toEqual({
      revisedQuoteCount: 0,
      status: "Pending Customer Costing",
    })
    await expect(
      pool.query<{ overhead_cost: string }>(
        "SELECT overhead_cost::text FROM catalog.items WHERE id = $1",
        [sharedItemId]
      )
    ).resolves.toMatchObject({ rows: [{ overhead_cost: "4" }] })

    const handedOff = await repository.listBulkPriceRevisions(organizationCode)
    expect(handedOff).toContainEqual(
      expect.objectContaining({
        id: revision.id,
        revisedQuoteCount: 0,
        status: "Pending Customer Costing",
      })
    )
    expect(
      (
        await repository.listProductBulkPriceRevisionsBounded(organizationCode)
      ).rows
    ).not.toContainEqual(expect.objectContaining({ id: revision.id }))
    expect(
      (
        await repository.listCustomerBulkPriceRevisionsBounded(
          organizationCode
        )
      ).rows
    ).toContainEqual(expect.objectContaining({ id: revision.id }))
    expect(await repository.listBulkPriceRevisionStages(revision.id)).toEqual([
      expect.objectContaining({
        fieldName: "overhead_cost",
        isApplied: true,
        selectedCount: 1,
      }),
    ])

    await repository.stageBulkPriceRevisionChange({
      bulkPriceRevisionId: revision.id,
      fieldName: "profit_percent",
      newValue: 0.25,
      selectedQuoteItemIds: [firstQuoteId],
    })
    await expect(
      repository.completeBulkPriceRevision({
        bulkPriceRevisionId: revision.id,
      })
    ).resolves.toEqual({ revisedQuoteCount: 2, status: "Completed" })

    const activeAfter =
      await repository.listBulkPriceRevisionActivePricesBounded(revision.id)
    expect(activeAfter.rows).toHaveLength(2)
    expect(activeAfter.rows.map((price) => price.id)).not.toContain(firstQuoteId)
    expect(activeAfter.rows.map((price) => price.id)).not.toContain(
      secondQuoteId
    )
  })

  test("lists engineering change notes for an organization with no ECNs", async () => {
    await expect(
      repository.listEngineeringChangeNotes(organizationCode)
    ).resolves.toEqual([])
  })

  test("exposes only ordered internal products to ECNs and rejects quoted items", async () => {
    const suffix = randomUUID()
    const orderedItemId = await createItem(`M-ECN-ELIGIBLE-${suffix}`, "List")
    const quotedItem = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          item_type, source_system, source_table, source_id
        )
        VALUES (
          $1, $2, 'QUOTE', 'Q', 'Quoted ECN blocker', 'List',
          'test', 'items', $3
        )
        RETURNING id
      `,
      [organizationId, `Q-ECN-BLOCK-${suffix}`, randomUUID()]
    )

    const reference =
      await repository.listEngineeringChangeReferenceData(organizationCode)

    expect(reference.items).toContainEqual(
      expect.objectContaining({ id: orderedItemId })
    )
    expect(reference.items).not.toContainEqual(
      expect.objectContaining({ id: quotedItem.rows[0]!.id })
    )
    await expect(
      repository.createEngineeringChangeNote({
        itemId: quotedItem.rows[0]!.id,
        organizationId,
        reason: "Quoted products cannot start an ECN",
      })
    ).rejects.toThrow("ordered internal product")
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

  test("loads the ECN affected-price graph within six statements", async () => {
    const suffix = randomUUID()
    const itemId = await createItem(`M-ECN-BATCH-${suffix}`, "List")
    const packageItemIds = await Promise.all(
      [0, 1].map((index) =>
        createItem(`P-ECN-BATCH-${index}-${suffix}`, "Package")
      )
    )
    await pool.query(
      `
        UPDATE catalog.items
        SET weight_100_pcs = 10, casting = 1, machining_cost = 100
        WHERE id = $1
      `,
      [itemId]
    )
    const childQuoteItemId = await createQuote({
      customerPartCode: `ECN-BATCH-CHILD-${suffix}`,
      itemId,
      itemType: "List",
      processBase: 100,
      profitPercent: 0.2,
      total: 120,
    })
    const packageQuoteItemIds = await Promise.all(
      packageItemIds.map((packageItemId, index) =>
        createQuote({
          child: { itemId, quoteItemId: childQuoteItemId, total: 120 },
          customerPartCode: `ECN-BATCH-${index}-${suffix}`,
          itemId: packageItemId,
          itemType: "Package",
          processBase: 10 + index,
          profitPercent: 0.2,
          total: 132 + index,
        })
      )
    )
    const quoteItemIds = [childQuoteItemId, ...packageQuoteItemIds]
    const ecn = await repository.createEngineeringChangeNote({
      itemId,
      organizationId,
      reason: "Bound the affected-price graph",
    })
    await repository.completeEngineeringChangeDesign({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { description: `Revised ${suffix}` },
    })
    await repository.completeEngineeringChangeProductCosting({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { machiningCost: 140 },
    })

    const trackedPool = new Pool({ connectionString, max: 1 })
    let statementCount = 0
    trackedPool.on("connect", (client) => {
      const originalQuery = client.query.bind(client)
      client.query = ((...args: Parameters<typeof client.query>) => {
        statementCount += 1
        return originalQuery(...args)
      }) as typeof client.query
    })
    const trackedRepository = createCommercialRevisionsRepository({
      pool: trackedPool,
    })

    try {
      const affected =
        await trackedRepository.listEngineeringChangeAffectedPrices(ecn.id)

      expect(affected.map((price) => price.quoteItemId).sort()).toEqual(
        quoteItemIds.sort()
      )
      expect(statementCount).toBeLessThanOrEqual(6)
    } finally {
      await trackedRepository.close()
      await trackedPool.end()
    }
  })

  test("shares the exhaustive graph with branching ECN decisions", async () => {
    const suffix = randomUUID()
    const itemId = await createItem(`M-ECN-DECISION-${suffix}`, "List")
    const packageItemIds = await Promise.all(
      [0, 1].map((index) =>
        createItem(`P-ECN-DECISION-${index}-${suffix}`, "Package")
      )
    )
    await pool.query(
      `
        UPDATE catalog.items
        SET weight_100_pcs = 10, casting = 1, machining_cost = 100
        WHERE id = $1
      `,
      [itemId]
    )
    const childQuoteItemId = await createQuote({
      customerPartCode: `ECN-DECISION-CHILD-${suffix}`,
      itemId,
      itemType: "List",
      processBase: 100,
      profitPercent: 0.2,
      total: 120,
    })
    const rollbackQuoteItemId = await createQuote({
      customerPartCode: `ECN-DECISION-ROLLBACK-${suffix}`,
      itemId,
      itemType: "List",
      processBase: 110,
      profitPercent: 0.2,
      total: 132,
    })
    const packageQuoteItemIds = await Promise.all(
      packageItemIds.map((packageItemId, index) =>
        createQuote({
          child: { itemId, quoteItemId: childQuoteItemId, total: 120 },
          customerPartCode: `ECN-DECISION-${index}-${suffix}`,
          itemId: packageItemId,
          itemType: "Package",
          processBase: 10 + index,
          profitPercent: 0.2,
          total: 132 + index,
        })
      )
    )
    const ecn = await repository.createEngineeringChangeNote({
      itemId,
      organizationId,
      reason: "Share the complete decision graph",
    })
    await repository.completeEngineeringChangeDesign({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { description: `Decision revision ${suffix}` },
    })
    await repository.completeEngineeringChangeProductCosting({
      engineeringChangeNoteId: ecn.id,
      itemPatch: { machiningCost: 140 },
    })
    const preview = await repository.listEngineeringChangeAffectedPrices(ecn.id)
    const selectedPreview = preview.find(
      (price) => price.quoteItemId === packageQuoteItemIds[0]
    )!

    const trackedPool = new Pool({ connectionString, max: 1 })
    let readStatements = 0
    trackedPool.on("connect", (client) => {
      const originalQuery = client.query.bind(client)
      client.query = ((...args: Parameters<typeof client.query>) => {
        const text = String(args[0]).trim()
        if (/^(select|with recursive)/i.test(text)) readStatements += 1
        return originalQuery(...args)
      }) as typeof client.query
    })
    const trackedRepository = createCommercialRevisionsRepository({
      pool: trackedPool,
    })

    try {
      const decision = await trackedRepository.applyEngineeringChangeDecision({
        decision: "Revise Price",
        engineeringChangeNoteId: ecn.id,
        notes: "Use the shared graph",
        sourceQuoteItemId: packageQuoteItemIds[0]!,
      })
      expect(decision).toMatchObject({
        newPrice: selectedPreview.revisePriceUsd,
        newProfitPercent: selectedPreview.reviseProfitPercent,
        status: "Pending Costing",
      })
      expect(readStatements).toBeLessThanOrEqual(6)

      const evidence = await pool.query<{
        decision_count: string
        event_count: string
        revision_orders: number[]
      }>(
        `
          SELECT
            (SELECT count(*)::text
             FROM sales.engineering_change_decisions decision
             WHERE decision.engineering_change_note_id = $1)
              AS decision_count,
            (SELECT count(*)::text
             FROM audit.events event
             WHERE event.target_id = $1
               AND event.event_type = 'engineering_change.price_decided')
              AS event_count,
            ARRAY(
              SELECT (quote.source_payload ->> 'revisionOrder')::integer
              FROM sales.quote_items quote
              WHERE quote.source_payload ->> 'sourceRecordId' = $1::text
              ORDER BY (quote.source_payload ->> 'revisionOrder')::integer
            ) AS revision_orders
        `,
        [ecn.id]
      )
      expect(evidence.rows[0]).toEqual({
        decision_count: "1",
        event_count: "1",
        revision_orders: [1, 2],
      })

      const beforeFailure = await pool.query<{
        quote_count: string
        source_status: string
      }>(
        `
          SELECT count(*)::text AS quote_count,
            max(status) FILTER (WHERE id = $1) AS source_status
          FROM sales.quote_items
          WHERE quote_number = (
            SELECT quote_number FROM sales.quote_items WHERE id = $1
          )
             OR quote_number = (
               SELECT quote_number FROM sales.quote_items WHERE id = $2
             )
        `,
        [rollbackQuoteItemId, rollbackQuoteItemId]
      )
      const failingPool = new Pool({ connectionString, max: 1 })
      failingPool.on("connect", (client) => {
        const originalQuery = client.query.bind(client)
        client.query = ((...args: Parameters<typeof client.query>) => {
          const text = String(args[0])
          if (text.includes("INSERT INTO sales.engineering_change_decisions")) {
            throw new Error("Injected late decision failure")
          }
          return originalQuery(...args)
        }) as typeof client.query
      })
      const failingRepository = createCommercialRevisionsRepository({
        pool: failingPool,
      })
      try {
        await expect(
          failingRepository.applyEngineeringChangeDecision({
            decision: "Revise Price",
            engineeringChangeNoteId: ecn.id,
            sourceQuoteItemId: rollbackQuoteItemId,
          })
        ).rejects.toThrow("Injected late decision failure")
      } finally {
        await failingRepository.close()
        await failingPool.end()
      }
      const afterFailure = await pool.query<{
        decision_count: string
        quote_count: string
        source_status: string
      }>(
        `
          SELECT
            (SELECT count(*)::text
             FROM sales.engineering_change_decisions decision
             WHERE decision.engineering_change_note_id = $3
               AND decision.source_quote_item_id = $1) AS decision_count,
            count(*)::text AS quote_count,
            max(status) FILTER (WHERE id = $1) AS source_status
          FROM sales.quote_items
          WHERE quote_number = (
            SELECT quote_number FROM sales.quote_items WHERE id = $1
          )
             OR quote_number = (
               SELECT quote_number FROM sales.quote_items WHERE id = $2
             )
        `,
        [rollbackQuoteItemId, rollbackQuoteItemId, ecn.id]
      )
      expect(afterFailure.rows[0]).toEqual({
        decision_count: "0",
        quote_count: beforeFailure.rows[0]!.quote_count,
        source_status: beforeFailure.rows[0]!.source_status,
      })
    } finally {
      await trackedRepository.close()
      await trackedPool.end()
    }
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
    const register = await repository.listPricingCorrections(organizationCode)
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
    const candidates =
      await repository.listCorrectionCandidates(organizationCode)
    expect(candidates.products).toContainEqual(
      expect.objectContaining({
        blockerCounts: expect.objectContaining({ quotes: 1 }),
        canReverse: false,
        id: blockedItemId,
      })
    )
  })
})
