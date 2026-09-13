import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { strFromU8, unzipSync } from "fflate"
import type { PricingInputTemplateRow } from "@workspace/db"
import {
  buildPricingInputWorkbook,
  parsePricingInputWorkbook,
  writePricingInputWorkbook,
} from "./input-workbook"

const rows: PricingInputTemplateRow[] = [
  {
    scope: "product",
    id: "product-1",
    version: "product-version",
    uid: "M2",
    description: "Package",
    customer: "Shared",
    customerPartCode: "",
    itemType: "Package",
    pricingMethod: "Derived",
    calculatedPrice: 0.5,
    values: {
      weight_100_pcs: 15,
      assembly_operation_cost: 5,
      overhead_cost: 10,
      rejection_percent: 0.01,
    },
  },
  {
    scope: "customer",
    id: "quote-1",
    version: "quote-version",
    uid: "M2",
    description: "Package",
    customer: "Customer",
    customerPartCode: "00068-0302",
    itemType: "Package",
    pricingMethod: "Derived",
    calculatedPrice: 0.2,
    values: {
      packing_cost: 10,
      shipping_cost: 6,
      profit_percent: 0.08,
      conversion_rate: 94.5,
    },
  },
]
const bytes = (workbook: XLSX.WorkBook) =>
  XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
function cell(sheet: XLSX.WorkSheet, header: string) {
  const width = XLSX.utils.decode_range(sheet["!ref"]!).e.c
  for (let c = 0; c <= width; c++)
    if (sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v === header)
      return XLSX.utils.encode_cell({ r: 1, c })
  throw new Error("Missing test header")
}

describe("pricing input workbook", () => {
  it("exports locked non-applicable cells and unlocked valid inputs", () => {
    const output = writePricingInputWorkbook(rows)
    const files = unzipSync(output)
    const styles = strFromU8(files["xl/styles.xml"]!)
    const unlocked = Number(styles.match(/<cellXfs count="(\d+)"/)![1]) - 1
    expect(styles).toContain('<protection locked="0"/>')
    const xml = strFromU8(files["xl/worksheets/sheet2.xml"]!)
    const sheet = buildPricingInputWorkbook(rows).Sheets["Product Inputs"]!
    const editable = cell(sheet, "Input | Assembly (INR/kg)")
    const blocked = cell(sheet, "Input | Sealant (INR/kg)")
    expect(xml).toContain("<sheetProtection")
    expect(xml.match(new RegExp(`<c r="${editable}"[^>]*>`))![0]).toContain(
      `s="${unlocked}"`
    )
    expect(xml.match(new RegExp(`<c r="${blocked}"[^>]*>`))![0]).not.toContain(
      `s="${unlocked}"`
    )
    expect(
      parsePricingInputWorkbook(Buffer.from(output)).map((row) => row.values)
    ).toEqual(rows.map((row) => row.values))
  })

  it("imports inputs by stable ID, preserves blank/zero semantics and ignores calculated prices", () => {
    const workbook = buildPricingInputWorkbook(rows)
    const sheet = workbook.Sheets["Customer Inputs"]!
    sheet[cell(sheet, "Input | Packing (INR/kg)")] = { t: "n", v: 0 }
    delete sheet[cell(sheet, "Input | Shipping (INR/kg)")]
    sheet[cell(sheet, "Input | Profit (%)")] = { t: "s", v: "10%" }
    sheet[cell(sheet, "Calculated — ignored | Current Price (USD/piece)")] = {
      t: "n",
      v: 999,
      f: "999",
    }
    const parsed = parsePricingInputWorkbook(bytes(workbook))
    expect(parsed[0]).toEqual({
      scope: "product",
      id: "product-1",
      version: "product-version",
      values: rows[0]!.values,
    })
    expect(parsed[1]).toEqual({
      scope: "customer",
      id: "quote-1",
      version: "quote-version",
      values: { packing_cost: 0, profit_percent: 0.1, conversion_rate: 94.5 },
    })
  })

  it("rejects Excel formulas in editable inputs", () => {
    const workbook = buildPricingInputWorkbook(rows)
    const sheet = workbook.Sheets["Product Inputs"]!
    sheet[cell(sheet, "Input | Assembly (INR/kg)")] = { t: "n", v: 5, f: "2+3" }
    expect(() => parsePricingInputWorkbook(bytes(workbook))).toThrow(
      "not an Excel formula"
    )
  })
})
