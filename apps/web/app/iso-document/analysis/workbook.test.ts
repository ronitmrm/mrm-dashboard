import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { parseAnalysisWorkbook } from "./workbook"

function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "2026")
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer
}
describe("ISO analysis workbook import", () => {
  it("preserves source details and separates pending work from completion awaiting QA", () => {
    const pest = parseAnalysisWorkbook(
      workbook([
        ["MRM-QA-021-01"],
        [
          "Date",
          "Issue Identified",
          "Factor",
          "Action Required",
          "Responsible Department",
          "Timeline",
          "Status",
        ],
        [
          46064,
          "Delivery demand",
          "Economical",
          "Improve planning",
          "Production + Planning",
          "90 Days",
          "pending",
        ],
      ]),
      "pest 2026.xlsx",
      "PEST"
    )[0]!
    expect(pest.fields).toMatchObject({
      category: "Economic",
      identifiedOn: "2026-02-11",
      dueOn: "2026-05-12",
      department: "Production + Planning",
      ownerUserId: null,
    })
    expect(pest.status).toBe("Open")
    expect(pest.source.columns.Status).toBe("pending")
    const swot = parseAnalysisWorkbook(
      workbook([
        ["MRM-QA-022-01"],
        [
          "Sr No.",
          "Description / Insight",
          "",
          "",
          "Analysis",
          "",
          "Action Plan",
          "",
          "",
          "",
          "Action taken",
          "Status",
          "Review date",
        ],
        [
          1,
          "Retention",
          "",
          "",
          "Threat ",
          "",
          "Career growth",
          "",
          "",
          "",
          "Planning under process",
          "Complet",
          46054,
        ],
      ]),
      "swot 2026.xlsx",
      "SWOT"
    )[0]!
    expect(swot.status).toBe("Completed")
    expect(swot.completionNotes).toBe("Planning under process")
    expect(swot.fields).toMatchObject({
      identifiedOn: null,
      reviewedOn: "2026-02-01",
      nextReviewOn: "2026-03-01",
    })
  })
  it("rejects the wrong workbook layout instead of importing incomplete records", () => {
    expect(() =>
      parseAnalysisWorkbook(
        workbook([
          ["Issue", "Notes"],
          ["A", "B"],
        ]),
        "wrong.xlsx",
        "SWOT"
      )
    ).toThrow("No SWOT rows found")
  })
})
