import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"

import {
  approvedPostsSheetName,
  buildApprovedPostsWorkbook,
  combinedJobsSheetName,
} from "./approved-posts-workbook"

const posts = [
  {
    combinedRoleId: "combined-1",
    combinedRoleName: "Combined operator",
    combinedVacancyCode: "CMB-1",
    department: "Production",
    departmentCode: "PR",
    designation: "Operator",
    employeeCode: "EMP-001",
    employeeName: "Ankit",
    id: "post-1",
    isPrimaryCombinedPost: true,
    joiningDate: null,
    lastWorkingDate: null,
    postCode: "PR-OP-1",
    requirementTemplateCode: "JRT-0001",
    status: "Occupied",
    vacancyCode: "CMB-1",
    vacancyNumber: "1",
  },
  {
    combinedRoleId: null,
    combinedRoleName: null,
    combinedVacancyCode: null,
    department: "Quality",
    departmentCode: "QC",
    designation: "Inspector",
    employeeCode: null,
    employeeName: null,
    id: "post-2",
    isPrimaryCombinedPost: false,
    joiningDate: null,
    lastWorkingDate: null,
    postCode: "QC-IN-1",
    requirementTemplateCode: "JRT-0002",
    status: "Vacant",
    vacancyCode: "QC-IN-1",
    vacancyNumber: "1",
  },
]

const templates = [
  {
    combinedRoleId: null,
    combinedRoleName: null,
    department: "Production",
    departmentCode: "PR",
    designation: "Operator",
    designationCode: "OP",
    education: null,
    experienceRequirement: null,
    gender: null,
    id: "template-1",
    maximumSalary: null,
    minimumSalary: null,
    name: "Machine operator",
    roleResponsibilities: null,
    templateCode: "JRT-0001",
  },
  {
    combinedRoleId: null,
    combinedRoleName: null,
    department: "Quality",
    departmentCode: "QC",
    designation: "Inspector",
    designationCode: "IN",
    education: null,
    experienceRequirement: null,
    gender: null,
    id: "template-2",
    maximumSalary: null,
    minimumSalary: null,
    name: "Quality inspector",
    roleResponsibilities: null,
    templateCode: "JRT-0002",
  },
]

const combinedRoles = [
  {
    id: "combined-1",
    name: "Combined operator",
    postCodes: ["PR-OP-1", "PR-OP-2"],
    primaryPostCode: "PR-OP-1",
    status: "Active",
    vacancyCode: "CMB-1",
  },
]

describe("approved posts workbook", () => {
  it("lists every post with its job template and combined-job membership", () => {
    const workbook = buildApprovedPostsWorkbook({
      combinedRoles,
      posts,
      templates,
    })

    expect(workbook.SheetNames).toEqual([
      approvedPostsSheetName,
      combinedJobsSheetName,
    ])
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
      workbook.Sheets[approvedPostsSheetName]!
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        "Combined Job Code": "CMB-1",
        "Combined Job Name": "Combined operator",
        "Combined Job?": "Yes",
        "Job Template Code": "JRT-0001",
        "Job Template Name": "Machine operator",
        "Post Code": "PR-OP-1",
        "Primary Post?": "Yes",
      })
    )
    expect(rows[1]).toEqual(
      expect.objectContaining({
        "Combined Job?": "No",
        "Job Template Code": "JRT-0002",
        "Job Template Name": "Quality inspector",
        "Post Code": "QC-IN-1",
      })
    )
  })

  it("summarizes combined jobs with their members and primary employee", () => {
    const workbook = buildApprovedPostsWorkbook({
      combinedRoles,
      posts,
      templates,
    })
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(
      workbook.Sheets[combinedJobsSheetName]!
    )

    expect(rows).toEqual([
      expect.objectContaining({
        "Combined Job Code": "CMB-1",
        "Employee Code": "EMP-001",
        "Employee Name": "Ankit",
        "Member Post Codes": "PR-OP-1, PR-OP-2",
        "Member Post Count": 2,
        "Primary Post Code": "PR-OP-1",
      }),
    ])
  })
})
