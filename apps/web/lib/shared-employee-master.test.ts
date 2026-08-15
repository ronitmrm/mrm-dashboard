import type { RecruitmentPostRow } from "@workspace/db"
import { describe, expect, it } from "vitest"

import {
  productionMachinistOptions,
  productionWorkerOptions,
  sharedEmployeeMasterRows,
} from "./shared-employee-master"

function post(
  values: Partial<RecruitmentPostRow> & Pick<RecruitmentPostRow, "id" | "status">
) {
  return {
    combinedRoleId: null,
    combinedRoleName: null,
    combinedVacancyCode: null,
    department: "Production",
    departmentCode: null,
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

  it("offers only active machinists from the selected production unit", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Production Planning & Control Conventional-01",
        designation: "Assistant Machinist",
        employeeCode: "MACH-1",
        employeeName: "Amit",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Production Planning & Control CNC-01",
        designation: "Machinist",
        employeeCode: "MACH-2",
        employeeName: "Bharat",
        id: "2",
        status: "Occupied",
      }),
      post({
        department: "Production Planning & Control Conventional-01",
        designation: "Operator",
        employeeCode: "OP-1",
        employeeName: "Chirag",
        id: "3",
        status: "Occupied",
      }),
    ])

    expect(productionMachinistOptions(rows, "conventional")).toEqual([
      { code: "MACH-1", name: "Amit" },
    ])
  })

  it("keeps conventional machinists available after their department is renamed", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Machining Team",
        departmentCode: "PPC-CVM",
        designation: "Assistant",
        employeeCode: "73",
        employeeName: "Dharaviya Ketanbhai",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Machining Team",
        departmentCode: "PPC-CVM",
        designation: "Manager",
        employeeCode: "166",
        employeeName: "Sakhiya Ankit",
        id: "2",
        status: "Occupied",
      }),
    ])

    expect(
      productionMachinistOptions(rows, "conventional")
    ).toEqual([{ code: "73", name: "Dharaviya Ketanbhai" }])
  })

  it("offers only active operators and workers from the selected production unit", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Production Planning & Control Conventional-01",
        designation: "Machine Operator",
        employeeCode: "OP-1",
        employeeName: "Chirag",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Production Planning & Control Conventional-01",
        designation: "Production Worker",
        employeeCode: "WORK-1",
        employeeName: "Deepak",
        id: "2",
        status: "Occupied",
      }),
      post({
        department: "Production Planning & Control CNC-01",
        designation: "Operator",
        employeeCode: "OP-2",
        employeeName: "Farhan",
        id: "3",
        status: "Occupied",
      }),
      post({
        department: "Production Planning & Control Conventional-01",
        designation: "Machinist",
        employeeCode: "MACH-1",
        employeeName: "Amit",
        id: "4",
        status: "Occupied",
      }),
    ])

    expect(productionWorkerOptions(rows, "conventional")).toEqual([
      { code: "OP-1", name: "Chirag" },
      { code: "WORK-1", name: "Deepak" },
    ])
  })
})
