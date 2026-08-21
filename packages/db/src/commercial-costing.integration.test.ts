import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createCommercialCostingRepository } from "./commercial-costing"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createCommercialCostingRepository({ connectionString })
let customerId: string
let enquiryItemId: string
let itemId: string
let organizationCode: string
let organizationId: string

async function createEnquiryItem(input: {
  customerPartCode: string
  itemId: string
  nextStageStatus?: string
}) {
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
    [organizationId, `ENQ-MIG08-${suffix}`, customerId, suffix]
  )
  const item = await pool.query<{ id: string }>(
    `
      INSERT INTO sales.enquiry_items (
        organization_id, enquiry_id, line_number, customer_part_code,
        description, quantity, item_id, technical_review_status,
        source_system, source_table, source_id
      )
      VALUES (
        $1, $2, 1, $3, 'Costing line', 100, $4, 'Feasible',
        'test', 'enquiry_items', $5
      )
      RETURNING id
    `,
    [
      organizationId,
      enquiry.rows[0]!.id,
      input.customerPartCode,
      input.itemId,
      suffix,
    ]
  )
  await pool.query(
    `
      INSERT INTO sales.design_tasks (
        organization_id, enquiry_item_id, status, design_status,
        portfolio_match_status, matched_product_id, design_bom_completed,
        next_stage_status, item_type, source_system, source_table, source_id
      )
      SELECT
        $1, $2, 'Complete', 'Design Complete', 'New Design Required', $3,
        'Yes', $4, catalog.items.item_type, 'test', 'design_tasks', $5
      FROM catalog.items
      WHERE catalog.items.id = $3
    `,
    [
      organizationId,
      item.rows[0]!.id,
      input.itemId,
      input.nextStageStatus ?? "Product Costing Complete",
      suffix,
    ]
  )
  return item.rows[0]!.id
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID()
  organizationCode = `MIG08-${suffix}`
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, 'MIG-08 Test')
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
      VALUES ($1, $2, 'Costing Customer', 'test', 'customers', $2)
      RETURNING id
    `,
    [organizationId, `C-${suffix}`]
  )
  customerId = customer.rows[0]!.id
  const grade = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.material_grades (
        organization_id, name, source_system, source_table, source_id
      )
      VALUES ($1, 'CZ121', 'test', 'product_grades', $2)
      RETURNING id
    `,
    [organizationId, `grade-${suffix}`]
  )
  const rodType = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.rod_types (
        organization_id, name, source_system, source_table, source_id
      )
      VALUES ($1, 'Round', 'test', 'product_rod_types', $2)
      RETURNING id
    `,
    [organizationId, `rod-${suffix}`]
  )
  await pool.query(
    `
      INSERT INTO sales.material_rates (
        organization_id, material_grade_id, rod_type_id, effective_on,
        rate_per_kg, alloy_premium, extrusion_cost, source_system,
        source_table, source_id
      )
      VALUES (
        $1, $2, $3, '2026-07-21', 100, 20, 10, 'test',
        'quote_material_rates', $4
      )
    `,
    [organizationId, grade.rows[0]!.id, rodType.rows[0]!.id, suffix]
  )
  const item = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        item_type, production_type, material_grade_id, rod_type_id,
        weight_100_pcs, casting, machining_cost, washing, checking,
        marking, plating, annealing, deburring, buffing, sealant,
        overhead_cost, rejection_percent, burning_loss_percent,
        source_system, source_table, source_id, source_payload
      )
      VALUES (
        $1, $2, 'QUOTE', 'Q', 'Derived precision item', 'List',
        'Barstock', $3, $4, 500, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 'test', 'products', $2,
        '{"firstMaterialLine":{"manufacturing_process":"Washing, Plating"}}'::jsonb
      )
      RETURNING id
    `,
    [organizationId, `Q-${suffix}`, grade.rows[0]!.id, rodType.rows[0]!.id]
  )
  itemId = item.rows[0]!.id
  enquiryItemId = await createEnquiryItem({
    customerPartCode: "CUSTOMER-PART-08",
    itemId,
    nextStageStatus: "Product Costing",
  })
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("PostgreSQL product-costing and quote workflow", () => {
  test("loads active material rates and Design-selected processes", async () => {
    await expect(
      repository.getProductCostingProduct(organizationCode, itemId)
    ).resolves.toMatchObject({
      alloyPremium: 20,
      extrusionCost: 10,
      processesRequired: ["Washing", "Plating"],
    })
  })

  test("suppresses manufacturing parameters for direct-purchase costing", async () => {
    const suffix = randomUUID()
    const direct = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          item_type, production_type, weight_100_pcs, alloy_premium,
          extrusion_cost, forging_cost, machining_cost, washing, checking,
          marking, plating, annealing, deburring, buffing, sealant,
          overhead_cost, burning_loss_percent, source_system, source_table,
          source_id
        )
        VALUES (
          $1, $2, 'QUOTE', 'Q', 'Direct purchase item', 'List', 'Forged',
          50, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 0.05,
          'test', 'products', $2
        )
        RETURNING id
      `,
      [organizationId, `Q-DIRECT-${suffix}`]
    )

    await repository.updateProductCostParameters({
      alloyPremium: 99,
      annealing: 99,
      burningLossPercent: 0.2,
      directPurchasePricePerKg: 500,
      extrusionCost: 99,
      forgingCost: 99,
      itemId: direct.rows[0]!.id,
      machiningCost: 99,
      overheadCost: 99,
      pricingMethod: "Direct Purchase",
      washing: 99,
      weight100Pcs: 50,
    })

    await expect(
      repository.getProductCostingProduct(organizationCode, direct.rows[0]!.id)
    ).resolves.toMatchObject({
      alloyPremium: 0,
      burningLossPercent: 0,
      directPurchasePricePerKg: 500,
      directPurchasePricePerPiece: 25,
      extrusionCost: 0,
      forgingCost: 0,
      machiningCost: 0,
      overheadCost: 0,
      pricingMethod: "Direct Purchase",
      washing: 0,
    })
  })

  test("bounds the Product Parameter Costing queue while keeping exact metrics", async () => {
    const result = await repository.listProductCostingTasksBounded(
      organizationCode,
      1
    )
    const summary =
      await repository.getProductCostingTaskSummary(organizationCode)

    expect(result.coverage).toMatchObject({ limit: 1, returned: 1 })
    expect(result.rows[0]).toMatchObject({
      nextStageStatus: "Product Costing",
      taskType: "Product Parameter Costing",
    })
    expect(summary.newProductCosting).toBeGreaterThanOrEqual(1)
    expect(summary.total).toBe(
      summary.newProductCosting + summary.productBulkRevisions + summary.ecn
    )
  })

  test("bounds the Customer Parameter Costing queue while keeping exact metrics", async () => {
    await repository.updateProductCostParameters({
      action: "complete",
      itemId,
    })

    const result = await repository.listCustomerCostingTasksBounded(
      organizationCode,
      1
    )
    const summary =
      await repository.getCustomerCostingTaskSummary(organizationCode)

    expect(result.coverage).toMatchObject({ limit: 1, returned: 1 })
    expect(result.rows[0]).toMatchObject({
      enquiryItemId,
      taskType: "New Quote Costing",
    })
    expect(summary.newQuoteCosting).toBeGreaterThanOrEqual(1)
    expect(summary.total).toBe(
      summary.newQuoteCosting +
        summary.poPriceMatch +
        summary.bulkPriceRevision +
        summary.ecnPriceReview
    )
  })

  test("preserves product parameter calculations and the quote workbook chain", async () => {
    const product = await repository.updateProductCostParameters({
      action: "complete",
      alloyPremium: null,
      annealing: 6,
      assemblyOperationCost: 999,
      buffing: 8,
      burningLossPercent: 0.1,
      checking: 3,
      deburring: 7,
      directPurchasePricePerKg: 0,
      extrusionCost: null,
      forgingCost: 99,
      itemId,
      machiningCost: 10,
      marking: 4,
      overheadCost: 11,
      plating: 5,
      pricingMethod: "Derived",
      rejectionPercent: 0.05,
      sealant: 9,
      washing: 2,
    })

    expect(product).toMatchObject({
      alloyPremium: 20,
      assemblyOperationCost: 0,
      extrusionCost: 10,
      forgingCost: 0,
      machiningPricePerPiece: 5,
      nextStageStatus: "Product Costing Complete",
      piecesPerKg: 2,
      productCostInr: 5,
    })

    const quote = await repository.saveQuote({
      customerPartCode: "CUSTOMER-PART-08",
      enquiryItemId,
      inputs: {
        conversionRate: 80,
        overheadCost: 14,
        packingCost: 12,
        profitPercent: 0.2,
        purchaseTimes: 0.5,
        scrapRate: 100,
        shippingCost: 13,
      },
      itemId,
      packaging: "Export",
      quantity: 100,
      shippingTerms: "FOB",
    })

    expect(quote).toMatchObject({
      isActive: false,
      rateInr: 150.6,
      rateUsd: 1.8825,
      revision: 1,
      status: "Draft",
      totalRateInr: 150.6,
    })
    await expect(
      repository.sendQuote({
        followupDueOn: "2026-09-30",
        quoteItemId: quote.id,
      })
    ).rejects.toThrow("Complete Customer Parameter Costing")

    const updatedDraft = await repository.saveQuote({
      action: "complete",
      customerPartCode: "CUSTOMER-PART-08",
      enquiryItemId,
      inputs: {
        conversionRate: 80,
        overheadCost: 14,
        packingCost: 12,
        profitPercent: 0.2,
        purchaseTimes: 0.5,
        scrapRate: 105,
        shippingCost: 13,
      },
      itemId,
      packaging: "Export",
      quantity: 100,
      shippingTerms: "FOB",
    })
    expect(updatedDraft.id).toBe(quote.id)
    expect(updatedDraft.status).toBe("Ready")

    const followupDueOn = "2026-09-30"
    const sent = await repository.sendQuote({
      followupDueOn,
      quoteItemId: quote.id,
    })
    expect(sent).toMatchObject({ isActive: true, revision: 1, status: "Sent" })
    await repository.sendQuote({ followupDueOn, quoteItemId: quote.id })
    const followup = await pool.query<{
      count: string
      due_on: string
      note: string
      quote_item_id: string
    }>(
      `
        SELECT count(*)::text AS count,
          max(due_on)::text AS due_on, max(note) AS note,
          max(quote_item_id)::text AS quote_item_id
        FROM sales.followups
        WHERE enquiry_id = (
          SELECT enquiry_id FROM sales.enquiry_items WHERE id = $1
        )
          AND status = 'Pending'
          AND quote_item_id = $2
      `,
      [enquiryItemId, quote.id]
    )
    expect(followup.rows[0]).toEqual({
      count: "1",
      due_on: followupDueOn,
      note: "Quote sent to Costing Customer.",
      quote_item_id: quote.id,
    })
    await pool.query(
      `
        UPDATE sales.followups
        SET status = 'Completed', completed_at = now()
        WHERE enquiry_id = (
          SELECT enquiry_id FROM sales.enquiry_items WHERE id = $1
        )
          AND note = 'Quote sent to Costing Customer. Follow up within 15 days.'
      `,
      [enquiryItemId]
    )
    await pool.query(
      `
        INSERT INTO sales.followups (
          organization_id, enquiry_id, due_on, status, note,
          source_system, source_table, source_id
        )
        SELECT $1, enquiry_id, current_date + 3, 'Pending',
          'Different operator follow-up.', 'test', 'followups', $2
        FROM sales.enquiry_items
        WHERE id = $3
      `,
      [organizationId, randomUUID(), enquiryItemId]
    )
    await repository.sendQuote({
      followupDueOn: "2026-09-30",
      quoteItemId: quote.id,
    })
    const followupLifecycle = await pool.query<{
      completed_exact: string
      email_count: string
      pending_exact: string
      quote_link_count: string
    }>(
      `
        SELECT
          count(*) FILTER (
            WHERE status = 'Completed'
              AND note = 'Quote sent to Costing Customer. Follow up within 15 days.'
          )::text AS completed_exact,
          count(*) FILTER (WHERE channel = 'Email')::text AS email_count,
          count(*) FILTER (
            WHERE status = 'Pending'
              AND note = 'Quote sent to Costing Customer. Follow up within 15 days.'
          )::text AS pending_exact,
          count(*) FILTER (WHERE quote_item_id IS NOT NULL)::text
            AS quote_link_count
        FROM sales.followups
        WHERE enquiry_id = (
          SELECT enquiry_id FROM sales.enquiry_items WHERE id = $1
        )
      `,
      [enquiryItemId]
    )
    expect(followupLifecycle.rows[0]).toEqual({
      completed_exact: "1",
      email_count: "3",
      pending_exact: "1",
      quote_link_count: "0",
    })
    await expect(
      repository.saveQuote({
        customerPartCode: "CUSTOMER-PART-08",
        enquiryItemId,
        inputs: {
          conversionRate: 80,
          overheadCost: 14,
          packingCost: 12,
          profitPercent: 0.2,
          purchaseTimes: 0.5,
          scrapRate: 110,
          shippingCost: 13,
        },
        itemId,
        quantity: 100,
      })
    ).rejects.toThrow("already been completed or sent")

    await expect(
      pool.query(
        `
          UPDATE sales.quote_product_snapshots
          SET total_cost = total_cost + 1
          WHERE quote_item_id = $1
        `,
        [quote.id]
      )
    ).rejects.toThrow("immutable")
  })

  test("supersedes one active lineage while keeping sent history", async () => {
    const secondEnquiryItemId = await createEnquiryItem({
      customerPartCode: "CUSTOMER-PART-08",
      itemId,
    })
    const second = await repository.saveQuote({
      action: "complete",
      customerPartCode: "CUSTOMER-PART-08",
      enquiryItemId: secondEnquiryItemId,
      inputs: {
        conversionRate: 80,
        overheadCost: 0,
        packingCost: 0,
        profitPercent: 0.1,
        purchaseTimes: 1,
        scrapRate: 100,
        shippingCost: 0,
      },
      itemId,
      quantity: 50,
    })
    const sent = await repository.sendQuote({
      followupDueOn: "2026-09-30",
      quoteItemId: second.id,
    })
    expect(sent.revision).toBe(2)

    const lineage = await pool.query<{
      active_count: string
      sent_count: string
      superseded_count: string
    }>(
      `
        SELECT
          count(*) FILTER (WHERE is_active)::text AS active_count,
          count(*) FILTER (WHERE sent_at IS NOT NULL)::text AS sent_count,
          count(*) FILTER (WHERE status = 'Superseded')::text AS superseded_count
        FROM sales.quote_items
        WHERE organization_id = $1
          AND customer_id = $2
          AND lower(customer_part_code) = lower('CUSTOMER-PART-08')
          AND lineage_item_id = $3
      `,
      [organizationId, customerId, itemId]
    )
    expect(lineage.rows[0]).toEqual({
      active_count: "1",
      sent_count: "2",
      superseded_count: "1",
    })
  })

  test("supersedes every active lineage for one nonblank customer code", async () => {
    const suffix = randomUUID()
    const code = `COLLISION-${suffix}`
    const items = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          item_type, weight_100_pcs, product_cost_inr, source_system,
          source_table, source_id
        )
        VALUES
          ($1, $2, 'QUOTE', 'Q', 'First collision item', 'List', 100, 5,
            'test', 'products', $2),
          ($1, $3, 'QUOTE', 'Q', 'Second collision item', 'List', 100, 6,
            'test', 'products', $3)
        RETURNING id
      `,
      [organizationId, `Q-COLLISION-A-${suffix}`, `Q-COLLISION-B-${suffix}`]
    )
    const quoteIds: string[] = []
    for (const [index, item] of items.rows.entries()) {
      const collisionEnquiryItemId = await createEnquiryItem({
        customerPartCode: code,
        itemId: item.id,
      })
      const quote = await repository.saveQuote({
        action: "complete",
        customerPartCode: code,
        enquiryItemId: collisionEnquiryItemId,
        inputs: {
          conversionRate: 80,
          overheadCost: 0,
          packingCost: 0,
          profitPercent: 0.1,
          purchaseTimes: 1,
          scrapRate: 100,
          shippingCost: 0,
        },
        itemId: item.id,
        quantity: 10 + index,
      })
      quoteIds.push(quote.id)
      const sent = await repository.sendQuote({
        followupDueOn: "2026-09-30",
        quoteItemId: quote.id,
      })
      expect(sent.revision).toBe(index + 1)
    }

    const state = await pool.query<{
      id: string
      is_active: boolean
      status: string
      superseded_by_quote_item_id: string | null
    }>(
      `
        SELECT id, status, is_active, superseded_by_quote_item_id
        FROM sales.quote_items
        WHERE id = ANY($1::uuid[])
        ORDER BY created_at
      `,
      [quoteIds]
    )
    expect(state.rows).toEqual([
      {
        id: quoteIds[0],
        is_active: false,
        status: "Superseded",
        superseded_by_quote_item_id: quoteIds[1],
      },
      {
        id: quoteIds[1],
        is_active: true,
        status: "Sent",
        superseded_by_quote_item_id: null,
      },
    ])
  })

  test("serializes concurrent sends for the same active-price scope", async () => {
    const suffix = randomUUID()
    const code = `CONCURRENT-${suffix}`
    const items = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          item_type, weight_100_pcs, product_cost_inr, source_system,
          source_table, source_id
        )
        VALUES
          ($1, $2, 'QUOTE', 'Q', 'First concurrent item', 'List', 100, 5,
            'test', 'products', $2),
          ($1, $3, 'QUOTE', 'Q', 'Second concurrent item', 'List', 100, 6,
            'test', 'products', $3)
        RETURNING id
      `,
      [organizationId, `Q-CONCURRENT-A-${suffix}`, `Q-CONCURRENT-B-${suffix}`]
    )
    const quoteIds = await Promise.all(
      items.rows.map(async (item, index) => {
        const concurrentEnquiryItemId = await createEnquiryItem({
          customerPartCode: code,
          itemId: item.id,
        })
        const quote = await repository.saveQuote({
          action: "complete",
          customerPartCode: code,
          enquiryItemId: concurrentEnquiryItemId,
          inputs: {
            conversionRate: 80,
            overheadCost: 0,
            packingCost: 0,
            profitPercent: 0.1,
            purchaseTimes: 1,
            scrapRate: 100,
            shippingCost: 0,
          },
          itemId: item.id,
          quantity: 20 + index,
        })
        return quote.id
      })
    )

    const sent = await Promise.all(
      quoteIds.map((quoteItemId) =>
        repository.sendQuote({
          followupDueOn: "2026-09-30",
          quoteItemId,
        })
      )
    )
    expect(sent.map((quote) => quote.revision).sort()).toEqual([2, 3])

    const state = await pool.query<{
      active_count: string
      sent_count: string
      superseded_count: string
    }>(
      `
        SELECT
          count(*) FILTER (WHERE is_active)::text AS active_count,
          count(*) FILTER (WHERE sent_at IS NOT NULL)::text AS sent_count,
          count(*) FILTER (WHERE status = 'Superseded')::text AS superseded_count
        FROM sales.quote_items
        WHERE id = ANY($1::uuid[])
      `,
      [quoteIds]
    )
    expect(state.rows[0]).toEqual({
      active_count: "1",
      sent_count: "2",
      superseded_count: "1",
    })
  })

  test("retains immediate package and nested assembly quote snapshots", async () => {
    const suffix = randomUUID()
    const items = await pool.query<{
      id: string
      item_type: string
      uid: string
    }>(
      `
        INSERT INTO catalog.items (
          organization_id, uid, lifecycle_status, description, item_type,
          weight_100_pcs, product_cost_inr, assembly_operation_cost,
          rejection_percent, source_system, source_table, source_id
        )
        VALUES
          ($1, $2, 'P', 'Leaf A', 'List', 100, 10, 0, 0, 'test', 'products', $2),
          ($1, $3, 'P', 'Leaf B', 'List', 50, 5, 0, 0, 'test', 'products', $3),
          ($1, $4, 'P', 'Nested assembly', 'Assembly', 150, 0, 15, 0, 'test', 'products', $4),
          ($1, $5, 'Q', 'Root package', 'Package', 0, 0, 30, 0.05, 'test', 'products', $5)
        RETURNING id, uid, item_type
      `,
      [
        organizationId,
        `M-A-${suffix}`,
        `M-B-${suffix}`,
        `A-${suffix}`,
        `PK-${suffix}`,
      ]
    )
    const byType = new Map(items.rows.map((row) => [row.uid, row.id]))
    const leafA = byType.get(`M-A-${suffix}`)!
    const leafB = byType.get(`M-B-${suffix}`)!
    const assembly = byType.get(`A-${suffix}`)!
    const packageId = byType.get(`PK-${suffix}`)!
    await pool.query(
      `
        INSERT INTO catalog.bom_lines (
          organization_id, parent_item_id, component_item_id, quantity,
          source_system, source_table, source_id
        )
        VALUES
          ($1, $2, $3, 3, 'test', 'bom_lines', $6),
          ($1, $4, $2, 1, 'test', 'bom_lines', $7),
          ($1, $4, $5, 2, 'test', 'bom_lines', $8)
      `,
      [
        organizationId,
        assembly,
        leafB,
        packageId,
        leafA,
        `${suffix}-1`,
        `${suffix}-2`,
        `${suffix}-3`,
      ]
    )
    const packageEnquiryItemId = await createEnquiryItem({
      customerPartCode: `PACKAGE-${suffix}`,
      itemId: packageId,
      nextStageStatus: "Product Costing",
    })
    await repository.updateProductCostParameters({
      action: "complete",
      assemblyOperationCost: 30,
      itemId: packageId,
      pricingMethod: "Derived",
    })
    const quote = await repository.saveQuote({
      action: "complete",
      assemblyProfitPercents: [{ itemId: assembly, profitPercent: 0.1 }],
      childInputs: [
        { itemId: leafA, profitPercent: 0.1, purchaseTimes: 1, scrapRate: 0 },
        { itemId: leafB, profitPercent: 0.2, purchaseTimes: 1, scrapRate: 0 },
      ],
      customerPartCode: `PACKAGE-${suffix}`,
      enquiryItemId: packageEnquiryItemId,
      inputs: {
        conversionRate: 80,
        overheadCost: 0,
        packingCost: 25,
        profitPercent: 0.15,
        purchaseTimes: 1,
        scrapRate: 0,
        shippingCost: 10,
      },
      itemId: packageId,
      quantity: 10,
    })
    const snapshot = await repository.getQuote(quote.id)
    expect(snapshot.components.map((row) => row.componentUid).sort()).toEqual(
      [`A-${suffix}`, `M-A-${suffix}`].sort()
    )
    const nested = snapshot.components.find(
      (row) => row.componentUid === `A-${suffix}`
    )!
    const nestedSnapshot = await repository.getQuote(nested.childQuoteItemId!)
    expect(nestedSnapshot.components.map((row) => row.componentUid)).toEqual([
      `M-B-${suffix}`,
    ])

    const register = await repository.listPricingRegister(organizationCode)
    const packageRows = register.filter(
      (row) =>
        row.customerPartCode === `PACKAGE-${suffix}` || row.componentDepth > 0
    )
    expect(packageRows.some((row) => row.componentDepth === 2)).toBe(true)
    expect(
      packageRows.every((row) => typeof row.calculation === "object")
    ).toBe(true)

    const packageEnquiry = await pool.query<{ enquiry_id: string }>(
      "SELECT enquiry_id FROM sales.enquiry_items WHERE id = $1",
      [packageEnquiryItemId]
    )
    await expect(
      repository.sendQuoteBackToProductCosting({
        enquiryId: packageEnquiry.rows[0]!.enquiry_id,
        itemId: packageId,
      })
    ).resolves.toEqual({ nextStageStatus: "Product Costing" })
    await repository.sendQuote({
      followupDueOn: "2026-09-30",
      quoteItemId: quote.id,
    })
    await expect(
      repository.sendQuoteBackToProductCosting({
        enquiryId: packageEnquiry.rows[0]!.enquiry_id,
        itemId: packageId,
      })
    ).rejects.toThrow("revision flow")
  })

  test("keeps a superseded sent row available to its historical quote PDF", async () => {
    const enquiry = await pool.query<{ enquiry_id: string }>(
      "SELECT enquiry_id FROM sales.enquiry_items WHERE id = $1",
      [enquiryItemId]
    )
    const document = await repository.getQuoteDocument(
      enquiry.rows[0]!.enquiry_id
    )
    expect(document.lines[0]).toMatchObject({
      customerPartCode: "CUSTOMER-PART-08",
      revision: 1,
      status: "Superseded",
    })
    expect(document.lines[0]?.sentAt).toBeInstanceOf(Date)

    const revisions = await repository.listPricingRegister(organizationCode, {
      revisions: true,
    })
    expect(
      revisions.some(
        (row) =>
          row.customerPartCode === "CUSTOMER-PART-08" &&
          row.status === "Superseded"
      )
    ).toBe(true)
  })

  test("exports the complete pricing graph across root batches", async () => {
    const canonical = await repository.listPricingRegister(organizationCode, {
      revisions: true,
    })
    const exported = await repository.listPricingRegisterForExport(
      organizationCode,
      { revisions: true },
      1
    )

    expect(exported).toEqual(canonical)
    expect(
      new Set(exported.map((row) => row.quoteNumber)).size
    ).toBeGreaterThan(1)
  })

  test("bounds the current pricing register after search and scopes complete revision history", async () => {
    const firstPage = await repository.listPricingRegisterBounded(
      organizationCode,
      { limit: 1 }
    )
    expect(firstPage.coverage).toMatchObject({
      limit: 1,
      returned: 1,
      truncated: true,
    })

    const current = await repository.listPricingRegisterBounded(
      organizationCode,
      { limit: 1, query: "CUSTOMER-PART-08" }
    )
    expect(current.coverage).toEqual({
      limit: 1,
      returned: 1,
      truncated: false,
    })
    const currentRoot = current.rows.find((row) => row.componentDepth === 0)
    expect(currentRoot).toMatchObject({
      customerPartCode: "CUSTOMER-PART-08",
      isActive: true,
    })

    const history = await repository.listPricingRevisionHistory(
      organizationCode,
      {
        customerId: currentRoot!.customerId,
        customerPartCode: " customer-part-08 ",
      }
    )
    expect(
      history
        .filter((row) => row.componentDepth === 0)
        .map((row) => row.status)
    ).toEqual(expect.arrayContaining(["Sent", "Superseded"]))
    expect(
      history
        .filter((row) => row.componentDepth === 0)
        .every(
          (row) =>
            row.customerId === currentRoot!.customerId &&
            row.customerPartCode === "CUSTOMER-PART-08"
        )
    ).toBe(true)
    await expect(
      repository.listPricingRevisionHistory(organizationCode, {
        customerId: "not-a-customer-id",
        customerPartCode: "CUSTOMER-PART-08",
      })
    ).resolves.toEqual([])
  })
})
