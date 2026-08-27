import type { RecruitmentPostRow } from "@workspace/db"
import { describe, expect, it } from "vitest"

import {
  productionDispatchApproverOptions,
  productionQualityOptions,
  productionShopFloorOptions,
  productionMachinistOptions,
  productionWorkerOptions,
  recruitmentInterviewerOptions,
  sharedEmployeeMasterRows,
} from "./shared-employee-master"

function post(
  values: Partial<RecruitmentPostRow> &
    Pick<RecruitmentPostRow, "id" | "status">
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
    joiningConfirmationDue: false,
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

    expect(productionMachinistOptions(rows, "conventional")).toEqual([
      { code: "73", name: "Dharaviya Ketanbhai" },
    ])
  })

  it("offers only active Workers from the selected unit's Shop Floor department", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Renamed Shop Floor Team",
        departmentCode: "PPC-CVSF",
        designation: "Assistant",
        employeeCode: "EMP-1",
        employeeName: "Sagar",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Renamed Shop Floor Team",
        departmentCode: "PPC-CVSF",
        designation: "Production Worker",
        employeeCode: "WORK-1",
        employeeName: "Deepak",
        id: "2",
        status: "Occupied",
      }),
      post({
        department: "CNC Shop Floor",
        departmentCode: "PPC-CNCSF",
        designation: "Worker",
        employeeCode: "WORK-2",
        employeeName: "Farhan",
        id: "3",
        status: "Occupied",
      }),
      post({
        department: "Machining Team",
        departmentCode: "PPC-CVM",
        designation: "Worker",
        employeeCode: "WORK-3",
        employeeName: "Amit",
        id: "4",
        status: "Occupied",
      }),
    ])

    expect(productionWorkerOptions(rows, "conventional")).toEqual([
      { code: "WORK-1", name: "Deepak" },
    ])
  })

  it("offers only active quality employees from the selected production unit", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Renamed Inprocess Team",
        departmentCode: "PPC-CVIQ",
        designation: "Assistant",
        employeeCode: "QC-1",
        employeeName: "Asha",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Renamed Inprocess Team",
        departmentCode: "PPC-CVIQ",
        designation: "Manager",
        employeeCode: "QC-MGR",
        employeeName: "Bhavesh",
        id: "2",
        status: "Occupied",
      }),
      post({
        department: "CNC Inprocess Quality",
        departmentCode: "PPC-CNCIQ",
        designation: "Assistant",
        employeeCode: "QC-2",
        employeeName: "Chetan",
        id: "3",
        status: "Occupied",
      }),
    ])

    expect(productionQualityOptions(rows, "conventional")).toEqual([
      { code: "QC-1", name: "Asha" },
    ])
  })

  it("offers only active shop-floor employees from the selected production unit", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Renamed Floor Team",
        departmentCode: "PPC-CVSF",
        designation: "Assistant",
        employeeCode: "SF-1",
        employeeName: "Deepak",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Renamed Floor Team",
        departmentCode: "PPC-CVSF",
        designation: "Hod",
        employeeCode: "SF-HOD",
        employeeName: "Esha",
        id: "2",
        status: "Occupied",
      }),
      post({
        department: "CNC Shop Floor",
        departmentCode: "PPC-CNCSF",
        designation: "Assistant",
        employeeCode: "SF-2",
        employeeName: "Farhan",
        id: "3",
        status: "Occupied",
      }),
    ])

    expect(productionShopFloorOptions(rows, "conventional")).toEqual([
      { code: "SF-1", name: "Deepak" },
    ])
  })

  it("offers selected-floor planners and shop-floor employees as dispatch approvers", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Production Planning & Control Conventional-01",
        departmentCode: "PPC-CV",
        designation: "Assistant",
        employeeCode: "PLAN-1",
        employeeName: "Asha Planner",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Production Planning & Control Conventional-01",
        designation: "Production Planner",
        employeeCode: "PLAN-2",
        employeeName: "Bharat Planner",
        id: "2",
        status: "Occupied",
      }),
      post({
        department: "Conventional Shop Floor",
        departmentCode: "PPC-CVSF",
        designation: "Assistant",
        employeeCode: "SF-1",
        employeeName: "Chetan Shop Floor",
        id: "3",
        status: "Occupied",
      }),
      post({
        department: "CNC Shop Floor",
        departmentCode: "PPC-CNCSF",
        designation: "Assistant",
        employeeCode: "SF-2",
        employeeName: "Deepak CNC",
        id: "4",
        status: "Occupied",
      }),
      post({
        department: "Production Planning & Control Conventional-01",
        departmentCode: "PPC-CV",
        designation: "Manager",
        employeeCode: "PLAN-MGR",
        employeeName: "Esha Manager",
        id: "5",
        status: "Occupied",
      }),
    ])

    expect(productionDispatchApproverOptions(rows, "conventional")).toEqual([
      { code: "PLAN-1", name: "Asha Planner" },
      { code: "PLAN-2", name: "Bharat Planner" },
      { code: "SF-1", name: "Chetan Shop Floor" },
    ])
  })

  it("offers all active HOD, manager, and management employees as interviewers", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Sales",
        designation: "Hod",
        employeeCode: "HOD-1",
        employeeName: "Amit",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Production",
        designation: "Manager",
        employeeCode: "MGR-1",
        employeeName: "Bina",
        id: "2",
        status: "Occupied",
      }),
      post({
        department: "Management",
        designation: "Management",
        employeeCode: "MGT-1",
        employeeName: "Chirag",
        id: "3",
        status: "Occupied",
      }),
      post({
        department: "Quality",
        designation: "Assistant",
        employeeCode: "AST-1",
        employeeName: "Deepa",
        id: "4",
        status: "Occupied",
      }),
      post({
        department: "Finance",
        designation: "Manager",
        employeeCode: "OLD-1",
        employeeName: "Former Manager",
        id: "5",
        status: "Resigned",
      }),
    ])

    expect(recruitmentInterviewerOptions(rows)).toEqual([
      { code: "HOD-1", name: "Amit" },
      { code: "MGR-1", name: "Bina" },
      { code: "MGT-1", name: "Chirag" },
    ])
  })

  it("offers appointed leadership who already have Employee IDs as interviewers", () => {
    expect(
      recruitmentInterviewerOptions([
        post({
          designation: "Hod",
          employeeCode: "101",
          employeeName: "Appointed Hod",
          id: "1",
          status: "Appointed",
        }),
        post({
          designation: "Manager",
          employeeCode: null,
          employeeName: "Future Manager",
          id: "2",
          status: "Appointed",
        }),
      ])
    ).toEqual([{ code: "101", name: "Appointed Hod" }])
  })

  it("keeps every active post available when one employee has several assignments", () => {
    const rows = sharedEmployeeMasterRows([
      post({
        department: "Production",
        designation: "Assistant",
        employeeCode: "EMP-1",
        employeeName: "Amit",
        id: "1",
        status: "Occupied",
      }),
      post({
        department: "Management",
        designation: "Manager",
        employeeCode: "EMP-1",
        employeeName: "Amit",
        id: "2",
        status: "Occupied",
      }),
    ])

    expect(recruitmentInterviewerOptions(rows)).toEqual([
      { code: "EMP-1", name: "Amit" },
    ])
  })
})
