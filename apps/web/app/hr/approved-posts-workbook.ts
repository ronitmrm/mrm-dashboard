import type {
  RecruitmentCombinedRoleRow,
  RecruitmentPostRow,
  RecruitmentTemplateRow,
} from "@workspace/db"
import * as XLSX from "xlsx"

export const approvedPostsSheetName = "Approved Posts"
export const combinedJobsSheetName = "Combined Jobs"

function worksheet(rows: Array<Array<string | number>>, widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet["!cols"] = widths.map((wch) => ({ wch }))
  sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1:A1" }
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 }
  return sheet
}

export function buildApprovedPostsWorkbook(input: {
  combinedRoles: RecruitmentCombinedRoleRow[]
  posts: RecruitmentPostRow[]
  templates: RecruitmentTemplateRow[]
}) {
  const workbook = XLSX.utils.book_new()
  const postByCode = new Map(input.posts.map((post) => [post.postCode, post]))
  const templateNameByCode = new Map(
    input.templates.map((template) => [template.templateCode, template.name])
  )
  const rolesByPostCode = new Map<string, RecruitmentCombinedRoleRow[]>()

  for (const role of input.combinedRoles) {
    for (const postCode of role.postCodes) {
      const roles = rolesByPostCode.get(postCode) ?? []
      roles.push(role)
      rolesByPostCode.set(postCode, roles)
    }
  }

  const approvedPostRows = input.posts.map((post) => {
    const roles = rolesByPostCode.get(post.postCode) ?? []
    const activeRole = roles.find((role) => role.status === "Active")
    const role = activeRole ?? roles[0]
    const templateCode = post.requirementTemplateCode ?? ""
    return [
      post.postCode,
      post.vacancyCode,
      post.department,
      post.designation,
      templateCode,
      templateCode ? (templateNameByCode.get(templateCode) ?? "") : "",
      role ? "Yes" : "No",
      role?.vacancyCode ?? "",
      role?.name ?? "",
      role?.status ?? "",
      role?.primaryPostCode === post.postCode ? "Yes" : role ? "No" : "",
      role?.postCodes.join(", ") ?? "",
      post.employeeName ?? "",
      post.employeeCode ?? "",
      post.lastWorkingDate ?? "",
      post.status,
    ]
  })

  const combinedJobRows = input.combinedRoles.map((role) => {
    const primaryPost = postByCode.get(
      role.primaryPostCode ?? role.postCodes[0] ?? ""
    )
    return [
      role.vacancyCode ?? "",
      role.name,
      role.status,
      role.primaryPostCode ?? "",
      role.postCodes.length,
      role.postCodes.join(", "),
      primaryPost?.employeeName ?? "",
      primaryPost?.employeeCode ?? "",
      primaryPost?.lastWorkingDate ?? "",
      primaryPost?.status ?? "",
    ]
  })

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet(
      [
        [
          "Post Code",
          "Vacancy Code",
          "Department",
          "Designation",
          "Job Template Code",
          "Job Template Name",
          "Combined Job?",
          "Combined Job Code",
          "Combined Job Name",
          "Combined Job Status",
          "Primary Post?",
          "Combined Member Posts",
          "Employee Name",
          "Employee Code",
          "Last Working Date",
          "Employment Status",
        ],
        ...approvedPostRows,
      ],
      [20, 20, 24, 28, 20, 34, 15, 20, 34, 20, 16, 54, 24, 20, 20, 20]
    ),
    approvedPostsSheetName
  )
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet(
      [
        [
          "Combined Job Code",
          "Combined Job Name",
          "Status",
          "Primary Post Code",
          "Member Post Count",
          "Member Post Codes",
          "Employee Name",
          "Employee Code",
          "Last Working Date",
          "Employment Status",
        ],
        ...combinedJobRows,
      ],
      [20, 34, 18, 22, 20, 54, 24, 20, 20, 20]
    ),
    combinedJobsSheetName
  )

  return workbook
}
