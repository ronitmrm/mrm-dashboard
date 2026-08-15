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
  const rows = new Map<string, SharedEmployeeMasterRow>()

  for (const post of posts) {
    const employeeName = post.employeeName?.trim() ?? ""
    const empId = post.employeeCode?.trim() || employeeName
    if (!empId || !employeeName) continue
    if (post.status !== "Occupied" && post.status !== "Resigned") continue

    const key = empId.toLocaleLowerCase("en-IN")
    if (rows.has(key)) continue
    rows.set(key, {
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

  return [...rows.values()].sort((left, right) =>
    left.employeeName.localeCompare(right.employeeName, "en-IN", {
      numeric: true,
    })
  )
}

const machinistDepartmentCodes = new Set([
  "PPC-CVM",
  "PPC-CV02M",
  "PPC-FGM",
])

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

export function productionMachinistOptions(
  rows: readonly {
    department?: unknown
    departmentCode?: unknown
    designation?: unknown
    empId?: unknown
    employeeName?: unknown
    status?: unknown
  }[],
  productionFloorCode: ProductionFloorCode
) {
  return rows
    .filter(
      (row) =>
        String(row.status).trim() === "Active" &&
        isMachinistEmployee(row) &&
        productionFloorFromDepartment(row.department, row.departmentCode) ===
          productionFloorCode
    )
    .map((row) => ({
      code: String(row.empId).trim(),
      name: String(row.employeeName).trim(),
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, "en-IN", { numeric: true })
    )
}

export function productionWorkerOptions(
  rows: readonly {
    department?: unknown
    departmentCode?: unknown
    designation?: unknown
    empId?: unknown
    employeeName?: unknown
    status?: unknown
  }[],
  productionFloorCode: ProductionFloorCode
) {
  return rows
    .filter(
      (row) =>
        String(row.status).trim() === "Active" &&
        /(operator|worker)/i.test(String(row.designation)) &&
        productionFloorFromDepartment(row.department, row.departmentCode) ===
          productionFloorCode
    )
    .map((row) => ({
      code: String(row.empId).trim(),
      name: String(row.employeeName).trim(),
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, "en-IN", { numeric: true })
    )
}
