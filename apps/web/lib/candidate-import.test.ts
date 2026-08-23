import { describe, expect, it } from "vitest"

import { candidateInputFromCsvRow } from "./candidate-import"

describe("candidate CSV import", () => {
  it("maps candidate fields and validates the phone-based identity", () => {
    expect(
      candidateInputFromCsvRow(
        {
          candidate_name: "Asha Rao",
          current_company: "MRMPL",
          department_code: "HR",
          designation_code: "REC",
          email: "asha@example.com",
          experience: "5 years",
          initial_notes: "Referral",
          phone_number: "9999999999",
          source: "Referral",
        },
        2
      )
    ).toEqual({
      currentCompany: "MRMPL",
      departmentCode: "HR",
      designationCode: "REC",
      email: "asha@example.com",
      experience: "5 years",
      name: "Asha Rao",
      notes: "Referral",
      phone: "9999999999",
      source: "Referral",
    })

    expect(() => candidateInputFromCsvRow({ candidate_name: "Asha" }, 3)).toThrow(
      "CSV row 3: Candidate Name and Phone are required."
    )
  })
})
