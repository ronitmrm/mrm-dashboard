import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"

import {
  buildEmployeeAssignmentWorkbook,
  combinedJobsSheetName,
  individualPostsSheetName,
  parseEmployeeAssignmentWorkbook,
} from "./employee-assignment-workbook"

const posts = [
  {
    combinedRoleId: "combined-1",
    combinedRoleName: "Combined operator",
    combinedVacancyCode: "CMB-1",
    department: "Production",
    designation: "Operator",
    employeeCode: null,
    employeeName: null,
    id: "post-1",
    isPrimaryCombinedPost: true,
    joiningDate: null,
    lastWorkingDate: null,
    postCode: "P-001",
    requirementTemplateCode: null,
    status: "Vacant",
    vacancyCode: "CMB-1",
    vacancyNumber: "1",
  },
  {
    combinedRoleId: null,
    combinedRoleName: null,
    combinedVacancyCode: null,
    department: "Quality",
    designation: "Inspector",
    employeeCode: null,
    employeeName: null,
    id: "post-2",
    isPrimaryCombinedPost: false,
    joiningDate: null,
    lastWorkingDate: null,
    postCode: "Q-001",
    requirementTemplateCode: null,
    status: "Vacant",
    vacancyCode: "Q-001",
    vacancyNumber: "1",
  },
]

describe("employee assignment workbook", () => {
  it("places combined jobs first and excludes their posts from individual rows", () => {
    const workbook = buildEmployeeAssignmentWorkbook({
      combinedRoles: [
        {
          id: "combined-1",
          name: "Combined operator",
          postCodes: ["P-001"],
          primaryPostCode: "P-001",
          status: "Active",
          vacancyCode: "CMB-1",
        },
      ],
      posts,
    })

    expect(workbook.SheetNames).toEqual([
      combinedJobsSheetName,
      individualPostsSheetName,
    ])
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets[individualPostsSheetName]!)
    ).toEqual([expect.objectContaining({ "Post Code": "Q-001" })])
  })

  it("parses combined assignments before individual assignments", () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [
          "Combined Job Code",
          "Employee Name",
          "Employee Code",
          "Employment Event",
          "Last Working Date",
        ],
        ["CMB-1", "Ankit", "E-1", "Joined", ""],
      ]),
      combinedJobsSheetName
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [
          "Post Code",
          "Employee Name",
          "Employee Code",
          "Employment Event",
          "Last Working Date",
        ],
        ["Q-001", "Ravi", "E-2", "Appointed", ""],
      ]),
      individualPostsSheetName
    )

    expect(parseEmployeeAssignmentWorkbook(workbook)).toEqual([
      expect.objectContaining({ targetCode: "CMB-1", targetType: "combined" }),
      expect.objectContaining({
        targetCode: "Q-001",
        targetType: "individual",
      }),
    ])
  })

  it("preserves repeated target transitions in workbook row order", () => {
    const workbook = buildEmployeeAssignmentWorkbook({
      combinedRoles: [],
      posts,
    })
    XLSX.utils.sheet_add_aoa(
      workbook.Sheets[individualPostsSheetName]!,
      [
        ["Q-001", "Quality", "Inspector", "", "", "", "", "Removed"],
        ["Q-001", "Quality", "Inspector", "", "", "Ravi", "E-2", "Appointed"],
      ],
      { origin: "A2" }
    )

    expect(parseEmployeeAssignmentWorkbook(workbook)).toEqual([
      expect.objectContaining({
        employeeEvent: "Removed",
        rowNumber: 2,
        targetCode: "Q-001",
      }),
      expect.objectContaining({
        employeeEvent: "Appointed",
        rowNumber: 3,
        targetCode: "Q-001",
      }),
    ])
  })

  it("rejects a row with an invalid event", () => {
    const workbook = buildEmployeeAssignmentWorkbook({
      combinedRoles: [],
      posts,
    })
    XLSX.utils.sheet_add_aoa(
      workbook.Sheets[individualPostsSheetName]!,
      [["Q-001", "Quality", "Inspector", "", "", "Ravi", "E-2", "Active"]],
      { origin: "A2" }
    )

    expect(() => parseEmployeeAssignmentWorkbook(workbook)).toThrow(
      "Employment Event must be Appointed, Joined, Resigned, or Removed"
    )
  })

  it("requires and preserves the last working date for a resignation", () => {
    const workbook = buildEmployeeAssignmentWorkbook({
      combinedRoles: [],
      posts,
    })
    XLSX.utils.sheet_add_aoa(
      workbook.Sheets[individualPostsSheetName]!,
      [
        [
          "Q-001",
          "Quality",
          "Inspector",
          "",
          "",
          "Ravi",
          "E-2",
          "Resigned",
          "2026-08-31",
        ],
      ],
      { origin: "A2" }
    )

    expect(parseEmployeeAssignmentWorkbook(workbook)).toEqual([
      expect.objectContaining({
        employeeEvent: "Resigned",
        lastWorkingDate: "2026-08-31",
      }),
    ])

    XLSX.utils.sheet_add_aoa(
      workbook.Sheets[individualPostsSheetName]!,
      [["Q-001", "Quality", "Inspector", "", "", "Ravi", "E-2", "Resigned", ""]],
      { origin: "A2" }
    )
    expect(() => parseEmployeeAssignmentWorkbook(workbook)).toThrow(
      "Last Working Date is required for Resigned"
    )
  })
})
