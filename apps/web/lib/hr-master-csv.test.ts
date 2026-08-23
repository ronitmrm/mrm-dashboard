import { describe, expect, it } from "vitest"

import {
  combinedRoleInputFromCsvRow,
  employeeAssignmentInputFromCsvRow,
} from "./hr-master-csv"

describe("HR master CSV inputs", () => {
  it("maps a combined approved-post row from post codes", () => {
    expect(
      combinedRoleInputFromCsvRow(
        {
          combined_role_name: "Production Lead",
          post_codes: "POST-01, POST-02",
          primary_post_code: "POST-01",
        },
        2
      )
    ).toEqual({
      name: "Production Lead",
      postCodes: ["POST-01", "POST-02"],
      primaryPostCode: "POST-01",
    })
  })

  it("maps an employee assignment row using the existing event contract", () => {
    expect(
      employeeAssignmentInputFromCsvRow(
        {
          employee_code: "EMP-04",
          employee_name: "Asha Shah",
          employment_event: "Joined",
          target_code: "POST-01",
          target_type: "individual",
        },
        3
      )
    ).toEqual({
      employeeCode: "EMP-04",
      employeeEvent: "Joined",
      employeeName: "Asha Shah",
      lastWorkingDate: null,
      rowNumber: 3,
      targetCode: "POST-01",
      targetType: "individual",
    })
  })

  it("rejects an invalid employee assignment event", () => {
    expect(() =>
      employeeAssignmentInputFromCsvRow(
        {
          employee_name: "Asha Shah",
          employment_event: "Transferred",
          target_code: "POST-01",
          target_type: "individual",
        },
        4
      )
    ).toThrow(
      "CSV row 4: Employment Event must be Appointed, Joined, Resigned, or Removed."
    )
  })
})
