import type {
  RecruitmentCombinedRoleRow,
  RecruitmentPostRow,
} from "@workspace/db"
import * as XLSX from "xlsx"

export const combinedJobsSheetName = "Combined Jobs"
export const individualPostsSheetName = "Individual Posts"

export type EmployeeAssignmentWorkbookRow = {
  employeeCode: string | null
  employeeEvent: "Appointed" | "Joined" | "Resigned" | "Removed"
  employeeName: string | null
  rowNumber: number
  targetCode: string
  targetType: "combined" | "individual"
}

const validEvents = new Set(["Appointed", "Joined", "Resigned", "Removed"])

function worksheet(rows: Array<Array<string>>, widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet["!cols"] = widths.map((wch) => ({ wch }))
  sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1:A1" }
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 }
  return sheet
}

export function buildEmployeeAssignmentWorkbook(input: {
  combinedRoles: RecruitmentCombinedRoleRow[]
  posts: RecruitmentPostRow[]
}) {
  const workbook = XLSX.utils.book_new()
  const postByCode = new Map(input.posts.map((post) => [post.postCode, post]))
  const activeCombinedRoles = input.combinedRoles.filter(
    (role) => role.status === "Active" && role.vacancyCode
  )
  const combinedPostCodes = new Set(
    activeCombinedRoles.flatMap((role) => role.postCodes)
  )

  const combinedRows = activeCombinedRoles.map((role) => {
    const primaryPost = postByCode.get(
      role.primaryPostCode ?? role.postCodes[0] ?? ""
    )
    return [
      role.vacancyCode ?? "",
      role.name,
      role.postCodes.join(", "),
      primaryPost?.employeeName ?? "",
      primaryPost?.employeeCode ?? "",
      "",
      "",
      "",
    ]
  })
  const individualRows = input.posts
    .filter(
      (post) =>
        post.status !== "Inactive" && !combinedPostCodes.has(post.postCode)
    )
    .map((post) => [
      post.postCode,
      post.department,
      post.designation,
      post.employeeName ?? "",
      post.employeeCode ?? "",
      "",
      "",
      "",
    ])

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet(
      [
        [
          "Combined Job Code",
          "Combined Job Name",
          "Post Codes",
          "Current Employee Name",
          "Current Employee Code",
          "Employee Name",
          "Employee Code",
          "Employment Event",
        ],
        ...combinedRows,
      ],
      [20, 34, 54, 24, 20, 24, 20, 20]
    ),
    combinedJobsSheetName
  )
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet(
      [
        [
          "Post Code",
          "Department",
          "Designation",
          "Current Employee Name",
          "Current Employee Code",
          "Employee Name",
          "Employee Code",
          "Employment Event",
        ],
        ...individualRows,
      ],
      [20, 24, 28, 24, 20, 24, 20, 20]
    ),
    individualPostsSheetName
  )
  return workbook
}

function cell(row: unknown[], index: number) {
  return String(row[index] ?? "").trim()
}

function parseSheet(
  sheet: XLSX.WorkSheet | undefined,
  sheetName: string,
  targetType: EmployeeAssignmentWorkbookRow["targetType"]
) {
  if (!sheet) throw new Error(`The ${sheetName} sheet is missing.`)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    blankrows: false,
    defval: "",
    header: 1,
    raw: false,
  })
  const headers = (rows[0] ?? []).map((entry) =>
    String(entry ?? "")
      .trim()
      .toLowerCase()
  )
  const targetHeader =
    targetType === "combined" ? "combined job code" : "post code"
  const requiredHeaders = [
    targetHeader,
    "employee name",
    "employee code",
    "employment event",
  ]
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`The ${sheetName} sheet is missing the ${header} column.`)
    }
  }
  const targetIndex = headers.indexOf(targetHeader)
  const employeeNameIndex = headers.indexOf("employee name")
  const employeeCodeIndex = headers.indexOf("employee code")
  const employeeEventIndex = headers.indexOf("employment event")
  const parsed: EmployeeAssignmentWorkbookRow[] = []

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2
    const targetCode = cell(row, targetIndex)
    const employeeName = cell(row, employeeNameIndex)
    const employeeCode = cell(row, employeeCodeIndex)
    const employeeEvent = cell(row, employeeEventIndex)
    if (!employeeName && !employeeCode && !employeeEvent) return
    if (!targetCode) {
      throw new Error(`${sheetName} row ${rowNumber}: target code is required.`)
    }
    if (!validEvents.has(employeeEvent)) {
      throw new Error(
        `${sheetName} row ${rowNumber}: Employment Event must be Appointed, Joined, Resigned, or Removed.`
      )
    }
    if (employeeEvent !== "Removed" && !employeeName && !employeeCode) {
      throw new Error(
        `${sheetName} row ${rowNumber}: Employee Name or Employee Code is required.`
      )
    }
    parsed.push({
      employeeCode: employeeCode || null,
      employeeEvent:
        employeeEvent as EmployeeAssignmentWorkbookRow["employeeEvent"],
      employeeName: employeeName || null,
      rowNumber,
      targetCode,
      targetType,
    })
  })
  return parsed
}

export function parseEmployeeAssignmentWorkbook(workbook: XLSX.WorkBook) {
  const combined = parseSheet(
    workbook.Sheets[combinedJobsSheetName],
    combinedJobsSheetName,
    "combined"
  )
  const individual = parseSheet(
    workbook.Sheets[individualPostsSheetName],
    individualPostsSheetName,
    "individual"
  )
  const assignments = [...combined, ...individual]
  if (!assignments.length) {
    throw new Error(
      "No assignments were found. Fill Employment Event for each row you want to upload."
    )
  }
  return assignments
}
