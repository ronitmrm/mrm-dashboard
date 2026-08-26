import { csvValue, type MasterCsvRow } from "./master-data-csv"

const employeeEvents = ["Appointed", "Joined"] as const
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
): EmployeeAssignmentCsvInput | null {
  const targetType = csvValue(row, "target_type").toLowerCase()
  const targetCode = csvValue(row, "target_code", "post_code")
  const employeeName = csvValue(row, "employee_name")
  const employeeCode = csvValue(row, "employee_code")
  if (!employeeName && !employeeCode) return null
  const employeeEvent =
    csvValue(row, "employment_event", "employee_event") || "Appointed"
  if (targetType !== "combined" && targetType !== "individual") {
    throw new Error(
      `CSV row ${rowNumber}: Target Type must be combined or individual.`
    )
  }
  if (!targetCode) {
    throw new Error(`CSV row ${rowNumber}: Target Code is required.`)
  }
  if (!employeeEvents.includes(employeeEvent as EmployeeEvent)) {
    const manualVacancyInstruction = ["Resigned", "Removed"].includes(
      employeeEvent
    )
      ? " Vacate occupied posts manually first."
      : ""
    throw new Error(
      `CSV row ${rowNumber}: Employment Event must be Appointed or Joined.${manualVacancyInstruction}`
    )
  }
  return {
    employeeCode: employeeCode || null,
    employeeEvent: employeeEvent as EmployeeEvent,
    employeeName: employeeName || null,
    lastWorkingDate: null,
    rowNumber,
    targetCode,
    targetType: targetType as EmployeeAssignmentTargetType,
  }
}
