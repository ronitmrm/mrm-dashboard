import { describe, expect, it } from "vitest"

import { formatRmInwardDate, parseRmInwardUploadDate } from "./rm-inward-date"
import { parseTemplateUpload, TemplateUploadError } from "./template-upload"

describe("RM Inward date format", () => {
  it("shows existing date styles consistently and accepts DD-MM-YYYY uploads", () => {
    expect(formatRmInwardDate("21-Sep-26")).toBe("21-09-2026")
    expect(formatRmInwardDate("2026-09-30")).toBe("30-09-2026")
    expect(parseRmInwardUploadDate("29-02-2028")).toBe("2028-02-29")
  })

  it("fails a mixed-format file with a row remark before saving", () => {
    const csv = "rmInwardDate,rmInwardKg\n21-09-2026,12\n2026-09-30,13\n"
    expect(() => parseTemplateUpload(
      "rm_inward", "rm_inward.csv", Buffer.from(csv).toString("base64"),
      new Set(["rm_inward"])
    )).toThrow(TemplateUploadError)
    expect(() => parseTemplateUpload(
      "rm_inward", "rm_inward.csv", Buffer.from(csv).toString("base64"),
      new Set(["rm_inward"])
    )).toThrow(/Row 3: RM Inward Date .* must be DD-MM-YYYY/)
  })
})
