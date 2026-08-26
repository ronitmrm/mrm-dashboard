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

  it("defaults a completed employee assignment row to Appointed", () => {
    expect(
      employeeAssignmentInputFromCsvRow(
        {
          employee_code: "36",
          employee_name: "Bhavesh D Khichda",
          target_code: "AF-HO-1",
          target_type: "individual",
        },
        3
      )
    ).toEqual({
      employeeCode: "36",
      employeeEvent: "Appointed",
      employeeName: "Bhavesh D Khichda",
      lastWorkingDate: null,
      rowNumber: 3,
      targetCode: "AF-HO-1",
      targetType: "individual",
    })
  })

  it("ignores an untouched vacancy row", () => {
    expect(
      employeeAssignmentInputFromCsvRow(
        {
          employee_code: "",
          employee_name: "",
          target_code: "AF-AS-1",
          target_type: "individual",
        },
        2
      )
    ).toBeNull()
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
    ).toThrow("CSV row 4: Employment Event must be Appointed or Joined.")
  })

  it("requires occupied posts to be vacated outside the CSV", () => {
    expect(() =>
      employeeAssignmentInputFromCsvRow(
        {
          employee_name: "Asha Shah",
          employment_event: "Resigned",
          target_code: "POST-01",
          target_type: "individual",
        },
        5
      )
    ).toThrow(
      "CSV row 5: Employment Event must be Appointed or Joined. Vacate occupied posts manually first."
    )
  })
})
