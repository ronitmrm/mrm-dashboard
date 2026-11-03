import { expect, test } from "vitest"
import { csvDateValue, formatCsvDates } from "./csv-date"
import { masterCsvResponse, readMasterCsv } from "./master-data-csv"
import { parseTemplateUpload } from "./template-upload"

test("accepts the supplied checklist's DD-MM-YYYY date", () => {
  const csv = "checklistTitle,sequence,checkPoint,effectiveFrom\nફોર્જિંગ,1,ડાઈ તપાસો,29-10-2026\n"
  expect(parseTemplateUpload("setup_checklist_master", "checklist.csv", Buffer.from(csv).toString("base64"), new Set(["setup_checklist_master"])).rows[0])
    .toMatchObject({ checklistTitle: "ફોર્જિંગ", effectiveFrom: "2026-10-29" })
})

test("downloaded CSV dates use hyphens and can be uploaded again", async () => {
  const response = masterCsvResponse([{ "Purchase Date": "2026-10-29" }], "stock.csv")
  const csv = await response.text()
  expect(csv).toContain("29-10-2026")
  const [row] = await readMasterCsv(new File([csv], "stock.csv"))
  expect(csvDateValue(row!.purchase_date, 2, "Purchase Date")).toBe("2026-10-29")
  expect(formatCsvDates({ date: "29/10/2026", note: "A/B" })).toEqual({ date: "29-10-2026", note: "A/B" })
})

test("rejects slash dates, ISO dates and impossible days with row feedback", () => {
  for (const value of ["29/10/2026", "2026-10-29", "1-10-2026", "10-29-2026", "29-02-2026", "31-04-2026"]) {
    expect(() => csvDateValue(value, 3, "effectiveFrom")).toThrow("CSV row 3: effectiveFrom")
  }
  expect(csvDateValue("29-02-2028", 2, "date")).toBe("2028-02-29")
  expect(csvDateValue("", 2, "date")).toBe("")
})
