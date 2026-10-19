import { describe, expect, it } from "vitest"

import { formatRmInwardDate, parseRmInwardUploadDate } from "./rm-inward-date"
import { parseTemplateUpload, TemplateUploadError } from "./template-upload"

describe("RM Inward date format", () => {
  it("recognises downloaded RM record headings before validating and normalising values", () => {
    const csv = 'Jc No.,Rm Inward Date,Rm Inward Kg,RM Location\r\nP1446,02/09/2026,"1,015.90",001\r\n'
    expect(parseTemplateUpload(
      "rm_inward", "rm-inward-all-rows.csv", Buffer.from(csv).toString("base64"),
      new Set(["rm_inward"])
    ).rows).toEqual([
      { jcNo: "P1446", rmInwardDate: "2026-09-02", rmInwardKg: 1015.9, rmLocation: "001" },
    ])
  })

  it("reports an invalid received quantity before saving the file", () => {
    const csv = 'rmInwardDate,rmInwardKg\n02/09/2026,12\n03/09/2026,"1,2,3"\n'
    expect(() => parseTemplateUpload(
      "rm_inward", "rm.csv", Buffer.from(csv).toString("base64"), new Set(["rm_inward"])
    )).toThrow(/Row 3: RM Inward Kg "1,2,3" must be a positive number/)
  })

  it("rejects two headings for the same RM field", () => {
    const csv = "rmInwardDate,Rm Inward Date\n02/09/2026,03/09/2026\n"
    expect(() => parseTemplateUpload(
      "rm_inward", "rm.csv", Buffer.from(csv).toString("base64"), new Set(["rm_inward"])
    )).toThrow(/Duplicate CSV column: rmInwardDate/)
  })

  it("shows existing date styles consistently and accepts DD/MM/YYYY uploads", () => {
    expect(formatRmInwardDate("21-Sep-26")).toBe("21/09/2026")
    expect(formatRmInwardDate("2026-09-30")).toBe("30/09/2026")
    expect(parseRmInwardUploadDate("29/02/2028")).toBe("2028-02-29")
  })

  it("fails a mixed-format file with a row remark before saving", () => {
    const csv = "rmInwardDate,rmInwardKg\n21/09/2026,12\n2026-09-30,13\n"
    expect(() => parseTemplateUpload(
      "rm_inward", "rm_inward.csv", Buffer.from(csv).toString("base64"),
      new Set(["rm_inward"])
    )).toThrow(TemplateUploadError)
    expect(() => parseTemplateUpload(
      "rm_inward", "rm_inward.csv", Buffer.from(csv).toString("base64"),
      new Set(["rm_inward"])
    )).toThrow(/CSV row 3: rmInwardDate .* must be a valid date in DD\/MM\/YYYY/)
  })
})
