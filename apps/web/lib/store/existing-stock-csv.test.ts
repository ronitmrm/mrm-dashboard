import { describe, expect, it } from "vitest"
import { existingStockCsvInputs } from "./existing-stock-csv"

const refs = {
  items: [{ id: "item", typeCode: "NC001", trackingMode: "SERIALIZED" }],
  locations: [{ id: "location", code: "MAIN" }],
  suppliers: [{ id: "supplier", code: "SUP001" }],
}
const row = {
  entry_reference: "OPEN-001",
  asset_code: "NC001",
  quantity: "1",
  storage_location_code: "MAIN",
  condition: "Usable",
  purchase_date: "15-03-2020",
  supplier_code: "SUP001",
  price_per_unit: "1200.00",
  serial_numbers: "OLD-01",
}

describe("existing stock CSV", () => {
  it("preserves historical fields and keeps references stable across uploads", () => {
    const [input] = existingStockCsvInputs([row], refs, "org")
    expect(input).toMatchObject({
      itemTypeId: "item",
      purchasedOn: "2020-03-15",
      supplierId: "supplier",
      unitPrice: "1200.00",
      serialNumbers: ["OLD-01"],
    })
    expect(
      existingStockCsvInputs(
        [{ ...row, entry_reference: "open-001" }],
        refs,
        "org"
      )[0]?.entryKey
    ).toBe(input?.entryKey)
    expect(existingStockCsvInputs([row], refs, "other")[0]?.entryKey).not.toBe(
      input?.entryKey
    )
  })
  it("rejects duplicates, unknown masters, fractional physical units and invalid dates with row feedback", () => {
    expect(() => existingStockCsvInputs([row, row], refs, "org")).toThrow(
      "CSV row 3"
    )
    expect(() =>
      existingStockCsvInputs([{ ...row, asset_code: "missing" }], refs, "org")
    ).toThrow("existing Asset")
    expect(() =>
      existingStockCsvInputs([{ ...row, quantity: "1.5" }], refs, "org")
    ).toThrow("whole number")
    expect(() =>
      existingStockCsvInputs(
        [{ ...row, purchase_date: "2020-03-15" }],
        refs,
        "org"
      )
    ).toThrow("DD-MM-YYYY")
    expect(() =>
      existingStockCsvInputs([{ ...row, quantity: "2001" }], refs, "org")
    ).toThrow("2,000 physical")
  })
  it("allows 2,000 rows and units, and rejects uploads over either limit", () => {
    const rows = Array.from({ length: 2000 }, (_, index) => ({
      ...row,
      entry_reference: `OPEN-${index}`,
      serial_numbers: "",
    }))
    expect(existingStockCsvInputs(rows, refs, "org")).toHaveLength(2000)
    expect(() =>
      existingStockCsvInputs(
        [...rows, { ...row, entry_reference: "EXTRA" }],
        refs,
        "org"
      )
    ).toThrow("2,000 rows")
    const units = rows
      .slice(0, 4)
      .map((entry) => ({ ...entry, quantity: "500" }))
    expect(existingStockCsvInputs(units, refs, "org")).toHaveLength(4)
    expect(() =>
      existingStockCsvInputs([...units, rows[4]!], refs, "org")
    ).toThrow("2,000 physical")
  })
})
