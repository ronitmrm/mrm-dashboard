import { csvValue, type MasterCsvRow } from "./master-data-csv"

const employeeEvents = ["Appointed", "Joined", "Resigned", "Removed"] as const
type EmployeeEvent = (typeof employeeEvents)[number]
type EmployeeAssignmentTargetType = "combined" | "individual"

export type EmployeeAssignmentCsvInput = {
  employeeCode: string | null
  employeeEvent: EmployeeEvent
  employeeName: string | null
  lastWorkingDate: string | null
  rowNumber: number
  targetCode: string
  targetType: EmployeeAssignmentTargetType
}

export function combinedRoleInputFromCsvRow(
  row: MasterCsvRow,
  rowNumber: number
) {
  const name = csvValue(row, "combined_role_name", "name")
  const postCodes = [
    ...new Set(
      csvValue(row, "post_codes", "approved_post_codes")
        .split(/[,;\n]/)
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ]
  const primaryPostCode = csvValue(row, "primary_post_code")
  if (!name) {
    throw new Error(`CSV row ${rowNumber}: Combined Role Name is required.`)
  }
  if (postCodes.length < 2) {
    throw new Error(
      `CSV row ${rowNumber}: At least two Post Codes are required.`
    )
  }
  if (!primaryPostCode || !postCodes.includes(primaryPostCode)) {
    throw new Error(
      `CSV row ${rowNumber}: Primary Post Code must be one of the Post Codes.`
    )
  }
  return { name, postCodes, primaryPostCode }
}

export function employeeAssignmentInputFromCsvRow(
  row: MasterCsvRow,
  rowNumber: number
): EmployeeAssignmentCsvInput {
  const targetType = csvValue(row, "target_type").toLowerCase()
  const targetCode = csvValue(row, "target_code", "post_code")
  const employeeName = csvValue(row, "employee_name")
  const employeeCode = csvValue(row, "employee_code")
  const employeeEvent = csvValue(row, "employment_event", "employee_event")
  const lastWorkingDate = csvValue(row, "last_working_date")
  if (targetType !== "combined" && targetType !== "individual") {
    throw new Error(
      `CSV row ${rowNumber}: Target Type must be combined or individual.`
    )
  }
  if (!targetCode) {
    throw new Error(`CSV row ${rowNumber}: Target Code is required.`)
  }
  if (!employeeEvents.includes(employeeEvent as EmployeeEvent)) {
    throw new Error(
      `CSV row ${rowNumber}: Employment Event must be Appointed, Joined, Resigned, or Removed.`
    )
  }
  if (employeeEvent !== "Removed" && !employeeName && !employeeCode) {
    throw new Error(
      `CSV row ${rowNumber}: Employee Name or Employee Code is required.`
    )
  }
  if (employeeEvent === "Resigned" && !lastWorkingDate) {
    throw new Error(
      `CSV row ${rowNumber}: Last Working Date is required for Resigned.`
    )
  }
  return {
    employeeCode: employeeCode || null,
    employeeEvent: employeeEvent as EmployeeEvent,
    employeeName: employeeName || null,
    lastWorkingDate: lastWorkingDate || null,
    rowNumber,
    targetCode,
    targetType: targetType as EmployeeAssignmentTargetType,
  }
}
