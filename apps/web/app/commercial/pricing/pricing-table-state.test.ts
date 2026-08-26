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
  it("uses one ASCII dash option for blank and dash-only values", () => {
    const rows: PricingTableRow[] = ["", "-", "—", "–"].map(
      (value, index) => ({
        customerId: "customer-id",
        rowKey: String(index),
        values: { "Quote Status": value },
      })
    )

    const columns = pricingFilterColumns(rows, ["Quote Status"])

    expect(columns[0]?.options).toEqual(["-"])
    expect(
      filterPricingTableRows(rows, columns, { 0: ["-"] }).map(
        (entry) => entry.rowKey
      )
    ).toEqual(["0", "1", "2", "3"])
  })

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
