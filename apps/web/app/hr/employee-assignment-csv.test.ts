import { describe, expect, it } from "vitest"

import { employeeAssignmentCsvRows } from "./employee-assignment-csv"

const post = (
  id: string,
  postCode: string,
  status: string,
  combinedRoleId: string | null = null
) => ({
  combinedRoleId,
  combinedRoleName: combinedRoleId ? "Combined operator" : null,
  combinedVacancyCode: combinedRoleId ? "CMB-1" : null,
  department: "Production",
  departmentCode: "PR",
  designation: "Operator",
  employeeCode: status === "Vacant" ? null : `EMP-${id}`,
  employeeName: status === "Vacant" ? null : `Employee ${id}`,
  id,
  isPrimaryCombinedPost: combinedRoleId === "combined-1",
  joiningConfirmationDue: false,
  joiningDate: null,
  lastWorkingDate: null,
  postCode,
  requirementTemplateCode: null,
  status,
  vacancyCode: combinedRoleId ? "CMB-1" : postCode,
  vacancyNumber: "1",
})

describe("employee assignment CSV", () => {
  it("prefills vacant assignments and excludes occupied posts", () => {
    const rows = employeeAssignmentCsvRows({
      combinedRoles: [
        {
          id: "combined-1",
          name: "Combined operator",
          postCodes: ["P-001", "P-002"],
          primaryPostCode: "P-001",
          status: "Active",
          vacancyCode: "CMB-1",
        },
      ],
      posts: [
        post("1", "P-001", "Vacant", "combined-1"),
        post("2", "P-002", "Vacant", "combined-1"),
        post("3", "Q-001", "Vacant"),
        post("4", "Q-002", "Occupied"),
      ],
    })

    expect(rows).toEqual([
      {
        approved_post_codes: "P-001, P-002",
        department: "Production",
        designation: "Operator",
        employee_code: "",
        employee_name: "",
        employment_event: "",
        target_code: "CMB-1",
        target_type: "combined",
      },
      {
        approved_post_codes: "Q-001",
        department: "Production",
        designation: "Operator",
        employee_code: "",
        employee_name: "",
        employment_event: "",
        target_code: "Q-001",
        target_type: "individual",
      },
    ])
    expect(Object.keys(rows[0]!)).not.toContain("last_working_date")
  })

  it("excludes a combined assignment when any member post is occupied", () => {
    const rows = employeeAssignmentCsvRows({
      combinedRoles: [
        {
          id: "combined-1",
          name: "Combined operator",
          postCodes: ["P-001", "P-002"],
          primaryPostCode: "P-001",
          status: "Active",
          vacancyCode: "CMB-1",
        },
      ],
      posts: [
        post("1", "P-001", "Vacant", "combined-1"),
        post("2", "P-002", "Occupied", "combined-1"),
      ],
    })

    expect(rows).toEqual([])
  })
})
