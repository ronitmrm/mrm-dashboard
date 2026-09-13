import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"
import { createCommercialRevisionsRepository } from "./commercial-revisions"

function setup() {
  const product = {
    id: "product",
    uid: "R1",
    description: "Direct part",
    item_type: "List",
    pricing_method: "Direct Purchase",
    weight_100_pcs: "10",
    pieces_per_kg: "60",
    direct_purchase_price_per_piece: "2",
    rejection_percent: "0.01",
    product_cost_inr: "2",
    source_payload: {},
    row_version: 1,
  }
  const quote = {
    id: "quote",
    item_id: "product",
    customer_id: "customer",
    quote_number: "Q1",
    revision: 1,
    next_revision: 2,
    customer_part_code: "00068-0302",
    packing_cost: "10",
    shipping_cost: "5",
    profit_percent: "0.08",
    conversion_rate: "100",
    approved_price_usd: "0.023436",
    rate_usd: "0.023436",
    assembled_part_inr: "0",
    calculation_json: { totalA: 999, rateInr: 999 },
    snapshot_product_json: {},
    snapshot_calculation_json: {},
  }
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("SELECT id FROM core.organizations"))
      return { rows: [{ id: "org" }] }
    if (sql.includes("SELECT id FROM sales.quote_items"))
      return { rows: [{ id: "quote" }] }
    if (sql.includes("FROM sales.customers"))
      return { rows: [{ id: "customer", company_name: "Customer" }] }
    if (sql.includes("WITH RECURSIVE quote_tree")) return { rows: [quote] }
    if (sql.includes("FROM catalog.items") && !sql.startsWith("UPDATE"))
      return { rows: [product] }
    if (sql.includes("INSERT INTO core.number_sequences"))
      return { rows: [{ current_value: "1" }] }
    if (sql.includes("INSERT INTO sales.quote_items")) {
      const published = JSON.parse(String(values[0])) as Array<{
        price: number
        product: { piecesPerKg: number }
      }>
      expect(published[0]!.price).toBeCloseTo(0.023544, 9)
      expect(published[0]!.product.piecesPerKg).toBe(100)
    }
    return { rows: [] }
  })
  const repository = createCommercialRevisionsRepository({
    pool: {
      connect: async () => ({ query, release: vi.fn() }),
    } as unknown as Pool,
  })
  return { repository, product, query }
}

describe("pricing input revision", () => {
  it("finds no changes when only non-applicable package inputs are edited", async () => {
    const { repository, product, query } = setup()
    product.item_type = "Package"
    product.pricing_method = "Derived"
    product.source_payload = { processesRequired: ["Assembly"] }
    const rows = await repository.listPricingInputTemplate("MRMPL")
    const productRow = rows.find((row) => row.scope === "product")!
    const customerRow = rows.find((row) => row.scope === "customer")!
    expect(productRow.values.assembly_operation_cost).toBe(0)
    expect(productRow.values.sealant).toBeUndefined()
    expect(customerRow.values.scrap_rate).toBeUndefined()
    expect(customerRow.values.purchase_times).toBeUndefined()
    productRow.values.checking = 100
    productRow.values.sealant = 100
    customerRow.values.scrap_rate = 0
    await expect(
      repository.previewPricingInputUpdate("MRMPL", rows)
    ).rejects.toThrow("No input changes found")
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
      false
    )
  })

  it("previews and publishes the same recalculated price with audited history", async () => {
    const { repository, query } = setup()
    const rows = await repository.listPricingInputTemplate("MRMPL")
    rows.find((row) => row.scope === "customer")!.values.shipping_cost = 6
    rows.find((row) => row.scope === "customer")!.values.scrap_rate = 100
    rows.find((row) => row.scope === "product")!.values.checking = 100
    const preview = await repository.previewPricingInputUpdate("MRMPL", rows)
    expect(preview.changes.map((change) => change.field)).toEqual([
      "shipping_cost",
    ])
    expect(preview.prices[0]!.newPrice).toBeCloseTo(0.023544, 9)
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
      false
    )
    const result = await repository.applyPricingInputUpdate({
      organizationCode: "MRMPL",
      rows,
      previewToken: preview.token,
      reason: "Correct shipping input",
      actorUserId: "user",
    })
    expect(result.revisionNumber).toBe("BPR-0001")
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO sales.bulk_price_revision_changes")
      )
    ).toBe(true)
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT")
  })

  it("rejects stale inputs before creating a revision", async () => {
    const { repository, product, query } = setup()
    const rows = await repository.listPricingInputTemplate("MRMPL")
    rows.find((row) => row.scope === "customer")!.values.shipping_cost = 6
    const preview = await repository.previewPricingInputUpdate("MRMPL", rows)
    product.row_version++
    await expect(
      repository.applyPricingInputUpdate({
        organizationCode: "MRMPL",
        rows,
        previewToken: preview.token,
        reason: "Update",
        actorUserId: "user",
      })
    ).rejects.toThrow("stale")
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
      false
    )
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK")
  })
})
