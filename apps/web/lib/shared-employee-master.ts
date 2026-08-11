import type { RecruitmentPostRow } from "@workspace/db"

export type SharedEmployeeMasterRow = {
  department: string
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
