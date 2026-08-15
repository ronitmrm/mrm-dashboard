import type { RecruitmentPostRow } from "@workspace/db"
import {
  parseProductionFloorCode,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"

export type SharedEmployeeMasterRow = {
  department: string
  departmentCode: string | null
  designation: string
  doj: string | null
  empId: string
  employeeName: string
  employeeType: string
  location: string
  postCode: string
  status: "Active" | "Leaving"
  terminatedDate: string | null
}

export function sharedEmployeeMasterRows(
  posts: readonly RecruitmentPostRow[]
): SharedEmployeeMasterRow[] {
  const rows: SharedEmployeeMasterRow[] = []

  for (const post of posts) {
    const employeeName = post.employeeName?.trim() ?? ""
    const empId = post.employeeCode?.trim() || employeeName
    if (!empId || !employeeName) continue
    if (post.status !== "Occupied" && post.status !== "Resigned") continue

    rows.push({
      department: post.department,
      departmentCode: post.departmentCode,
      designation: post.designation,
      doj: post.joiningDate,
      empId,
      employeeName,
      employeeType: post.designation,
      location: post.department,
      postCode: post.postCode,
      status: post.status === "Resigned" ? "Leaving" : "Active",
      terminatedDate: post.lastWorkingDate,
    })
  }

  return rows.sort(
    (left, right) =>
      left.employeeName.localeCompare(right.employeeName, "en-IN", {
        numeric: true,
      }) || left.postCode.localeCompare(right.postCode, "en-IN", { numeric: true })
  )
}

const machinistDepartmentCodes = new Set([
  "PPC-CVM",
  "PPC-CV02M",
  "PPC-FGM",
])

const qualityDepartmentCodes = new Set([
  "PPC-CVIQ",
  "PPC-CV02IQ",
  "PPC-CNCIQ",
  "PPC-FGIQ",
])

const shopFloorDepartmentCodes = new Set([
  "PPC-CVSF",
  "PPC-CV02SF",
  "PPC-CNCSF",
  "PPC-FGSF",
])

type EmployeeOptionSource = {
  department?: unknown
  departmentCode?: unknown
  designation?: unknown
  empId?: unknown
  employeeName?: unknown
  status?: unknown
}

export type EmployeeOption = {
  code: string
  name: string
}

function productionFloorFromDepartment(
  department: unknown,
  departmentCode: unknown
): ProductionFloorCode | null {
  const code = String(departmentCode).trim().toUpperCase()
  if (code.startsWith("PPC-CV02")) return "conventional-02"
  if (code.startsWith("PPC-CV")) return "conventional"
  if (code.startsWith("PPC-CNC")) return "cnc"
  if (code.startsWith("PPC-FG")) return "forging"
  return parseProductionFloorCode(department)
}

function isMachinistEmployee(row: {
  department?: unknown
  departmentCode?: unknown
  designation?: unknown
}) {
  const designation = String(row.designation)
  if (/\b(hod|manager)\b/i.test(designation)) return false
  return (
    /machinist/i.test(designation) ||
    /machinist/i.test(String(row.department)) ||
    machinistDepartmentCodes.has(
      String(row.departmentCode).trim().toUpperCase()
    )
  )
}

function isLeadershipEmployee(row: EmployeeOptionSource) {
  return /\b(hod|manager|management)\b/i.test(String(row.designation))
}

function employeeOptions(
  rows: readonly EmployeeOptionSource[],
  matches: (row: EmployeeOptionSource) => boolean
): EmployeeOption[] {
  const options = new Map<string, EmployeeOption>()

  for (const row of rows) {
    if (String(row.status).trim() !== "Active" || !matches(row)) continue
    const code = String(row.empId).trim()
    const name = String(row.employeeName).trim()
    if (!code || !name) continue
    const key = code.toLocaleLowerCase("en-IN")
    if (!options.has(key)) options.set(key, { code, name })
  }

  return [...options.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "en-IN", { numeric: true })
  )
}

function belongsToProductionDepartment(
  row: EmployeeOptionSource,
  productionFloorCode: ProductionFloorCode,
  departmentCodes: ReadonlySet<string>,
  departmentNamePattern: RegExp
) {
  const departmentCode = String(row.departmentCode).trim().toUpperCase()
  return (
    !isLeadershipEmployee(row) &&
    (departmentCodes.has(departmentCode) ||
      departmentNamePattern.test(String(row.department))) &&
    productionFloorFromDepartment(row.department, row.departmentCode) ===
      productionFloorCode
  )
}

export function productionMachinistOptions(
  rows: readonly EmployeeOptionSource[],
  productionFloorCode: ProductionFloorCode
) {
  return employeeOptions(
    rows,
    (row) =>
      isMachinistEmployee(row) &&
      productionFloorFromDepartment(row.department, row.departmentCode) ===
        productionFloorCode
  )
}

export function productionQualityOptions(
  rows: readonly EmployeeOptionSource[],
  productionFloorCode: ProductionFloorCode
) {
  return employeeOptions(rows, (row) =>
    belongsToProductionDepartment(
      row,
      productionFloorCode,
      qualityDepartmentCodes,
      /\b(?:in\s*process\s+)?quality(?:\s+control)?\b/i
    )
  )
}

export function productionShopFloorOptions(
  rows: readonly EmployeeOptionSource[],
  productionFloorCode: ProductionFloorCode
) {
  return employeeOptions(rows, (row) =>
    belongsToProductionDepartment(
      row,
      productionFloorCode,
      shopFloorDepartmentCodes,
      /\bshop\s+floor\b/i
    )
  )
}

export function recruitmentInterviewerOptions(
  rows: readonly EmployeeOptionSource[]
) {
  return employeeOptions(rows, isLeadershipEmployee)
}

export function productionWorkerOptions(
  rows: readonly EmployeeOptionSource[],
  productionFloorCode: ProductionFloorCode
) {
  return employeeOptions(
    rows,
    (row) =>
      /(operator|worker)/i.test(String(row.designation)) &&
      productionFloorFromDepartment(row.department, row.departmentCode) ===
        productionFloorCode
  )
}
