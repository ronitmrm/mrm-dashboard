import type { RecruitmentPostRow } from "@workspace/db"
import { describe, expect, it } from "vitest"

import { sharedEmployeeMasterRows } from "./shared-employee-master"

function post(
  values: Partial<RecruitmentPostRow> & Pick<RecruitmentPostRow, "id" | "status">
) {
  return {
    combinedRoleId: null,
    combinedRoleName: null,
    combinedVacancyCode: null,
    department: "Production",
    designation: "Operator",
    employeeCode: null,
    employeeName: null,
    isPrimaryCombinedPost: false,
    joiningDate: null,
    lastWorkingDate: null,
    postCode: `POST-${values.id}`,
    requirementTemplateCode: null,
    vacancyCode: `VAC-${values.id}`,
    vacancyNumber: values.id,
    ...values,
  } as RecruitmentPostRow
}

describe("shared Employee Master", () => {
  it("provides joined HR employees to every Production floor", () => {
    expect(
      sharedEmployeeMasterRows([
        post({
          employeeCode: "EMP-1",
          employeeName: "Rakesh Harebha",
          id: "1",
          joiningDate: "2026-08-01",
          status: "Occupied",
        }),
      ])
    ).toEqual([
      expect.objectContaining({
        empId: "EMP-1",
        employeeName: "Rakesh Harebha",
        status: "Active",
      }),
    ])
  })

  it("excludes vacant and not-yet-joined appointments", () => {
    expect(
      sharedEmployeeMasterRows([
        post({ id: "1", status: "Vacant" }),
        post({
          employeeCode: "EMP-2",
          employeeName: "Future Employee",
          id: "2",
          status: "Appointed",
        }),
      ])
    ).toEqual([])
  })
})
