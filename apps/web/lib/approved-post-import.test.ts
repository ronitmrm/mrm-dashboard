import { describe, expect, it } from "vitest"

import { approvedPostInputFromCsvRow } from "./approved-post-import"

describe("Approved Post CSV import", () => {
  it("maps the downloadable CSV columns to an Approved Post entry", () => {
    expect(
      approvedPostInputFromCsvRow(
        {
          department_code: "PROD",
          designation_code: "SUP",
          requirement_template_code: "JT-004",
        },
        2
      )
    ).toEqual({
      departmentCode: "PROD",
      designationCode: "SUP",
      requirementTemplateCode: "JT-004",
    })
  })

  it("identifies an incomplete CSV row before it is saved", () => {
    expect(() =>
      approvedPostInputFromCsvRow({ department_code: "PROD" }, 5)
    ).toThrow(
      "CSV row 5: Department Code and Designation Code are required."
    )
  })
})