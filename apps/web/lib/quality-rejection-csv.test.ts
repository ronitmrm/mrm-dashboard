import { describe, expect, test } from "vitest"
import { masterCsvResponse, readMasterCsv } from "./master-data-csv"
import { parseQualityRejectionCsv, qualityRejectionCsvColumns, qualityRejectionCsvRows } from "./quality-rejection-csv"

const row = {
  entry_id: "11111111-1111-4111-8111-111111111111",
  job_card: "JC-123",
  date: "2026-09-28",
  stage: "Checking",
  rejection_type: "Surface",
  defect: "Scratch",
  reason: "Handling",
  rejected_pieces: "12",
  rejected_kg: "1.250",
}

describe("Quality Control CSV", () => {
  test("reads a downloaded row for bulk editing", async () => {
    const response = masterCsvResponse(qualityRejectionCsvRows([{
      id: row.entry_id,
      jobCard: row.job_card,
      date: row.date,
      stage: row.stage,
      type: row.rejection_type,
      defect: row.defect,
      reason: row.reason,
      pieces: 12,
      kg: row.rejected_kg,
    }]), "quality-control-rejections.csv", qualityRejectionCsvColumns)
    const file = new File([await response.text()], "quality-control-rejections.csv")
    expect(parseQualityRejectionCsv(await readMasterCsv(file))).toEqual([{
      id: row.entry_id,
      jobCard: "JC-123",
      date: "2026-09-28",
      stage: "Checking",
      type: "Surface",
      defect: "Scratch",
      reason: "Handling",
      pieces: 12,
      kg: 1.25,
    }])
  })

  test("rejects duplicate entry IDs before writing", () => {
    expect(() => parseQualityRejectionCsv([row, row])).toThrow("CSV row 3: Entry ID is repeated.")
  })
})
