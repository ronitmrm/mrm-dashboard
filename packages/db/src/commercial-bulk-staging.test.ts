import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import { createCommercialRevisionsRepository } from "./commercial-revisions"

describe("bulk product staging query budget", () => {
  it("stages 3043 products without per-product database round trips", async () => {
    const products = Array.from({ length: 3043 }, (_, index) => ({
      id: `product-${index}`,
      uid: `M${index}`,
      product_cost_inr: "2",
      weight_100_pcs: "100",
      machining_cost: "20",
      item_type: "List",
      pricing_method: "Derived",
      source_payload: {},
    }))
    let calls = 0
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (++calls > 10)
        throw new Error("Bulk staging exceeded 10 database round trips")
      if (sql.includes("FROM sales.bulk_price_revisions"))
        return {
          rows: [
            {
              organization_id: "organization",
              customer_id: null,
              revision_route: "Product Parameter Bulk Revision",
              status: "Pending Costing",
            },
          ],
        }
      if (sql.includes("SELECT *") && sql.includes("catalog.items")) {
        return {
          rows: Array.isArray(values[0])
            ? products
            : products.filter((p) => p.id === values[0]),
        }
      }
      if (sql.includes("WITH RECURSIVE quote_tree"))
        return {
          rows: products.map((p) => ({
            item_id: p.id,
            quote_item_id: `quote-${p.id}`,
          })),
        }
      if (sql.includes("component_cost")) return { rows: [] }
      if (sql.includes("INSERT INTO sales.bulk_price_revision_changes")) {
        const staged = JSON.parse(String(values[0])) as Array<{
          item_id: string
          new_price: number
          payload: { productItemId: string; selectedProductIds?: string[] }
        }>
        expect(staged).toHaveLength(3043)
        expect(staged.every((row) => row.new_price === 2)).toBe(true)
        expect(staged.every((row) => row.item_id === row.payload.productItemId)).toBe(true)
        expect(staged.filter((row) => row.payload.selectedProductIds)).toHaveLength(1)
        expect(String(values[0]).length).toBeLessThan(2_000_000)
        return { rows: products.map((p) => ({ id: `change-${p.id}` })) }
      }
      return { rows: [] }
    })
    const release = vi.fn()
    const repository = createCommercialRevisionsRepository({
      pool: { connect: async () => ({ query, release }) } as unknown as Pool,
    })
    const result = await repository.stageBulkPriceRevisionChange({
      bulkPriceRevisionId: "revision",
      fieldName: "rejection_percent",
      newValue: 0.01,
      selectedProductIds: products.map((p) => p.id),
    })
    expect(result.selectedCount).toBe(3043)
    expect(result.changeIds).toHaveLength(3043)
    expect(calls).toBeLessThanOrEqual(10)
    expect(release).toHaveBeenCalledOnce()
  })
})
