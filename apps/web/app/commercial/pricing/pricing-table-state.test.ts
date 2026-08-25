import { describe, expect, it } from "vitest"

import {
  filterPricingTableRows,
  pricingFilterColumns,
  pricingPageSize,
  type PricingTableRow,
} from "./pricing-table-state"

function row(rowKey: string, uid: string, customer: string): PricingTableRow {
  return {
    customerId: "customer-id",
    rowKey,
    values: { Customer: customer, UID: uid },
  }
}

describe("pricing table complete-register filters", () => {
  it("filters the complete register before applying the visible-row limit", () => {
    const rows = Array.from({ length: pricingPageSize + 1 }, (_, index) =>
      row(
        String(index),
        index === pricingPageSize ? "TARGET-UID" : `UID-${index}`,
        "MRM"
      )
    )

    const columns = pricingFilterColumns(rows, ["UID", "Customer"])
    const filtered = filterPricingTableRows(rows, columns, {
      0: ["TARGET-UID"],
    })

    expect(pricingPageSize).toBe(200)
    expect(columns[0]?.options).toContain("TARGET-UID")
    expect(filtered.map((entry) => entry.rowKey)).toEqual(["200"])
  })
})
