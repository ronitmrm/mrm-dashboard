import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"

describe("SheetJS import and export", () => {
  it("round-trips a basic workbook", () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Part", "Quantity"],
        ["MRM-001", 12],
      ]),
      "Orders"
    )

    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })
    const imported = XLSX.read(bytes, { type: "buffer" })

    expect(imported.SheetNames).toEqual(["Orders"])
    expect(
      XLSX.utils.sheet_to_json(imported.Sheets.Orders!, { header: 1 })
    ).toEqual([
      ["Part", "Quantity"],
      ["MRM-001", 12],
    ])
  })
})
