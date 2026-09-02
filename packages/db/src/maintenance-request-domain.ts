export const maintenanceCategories = [
  "Electrical",
  "Plumbing",
  "Mechanical",
] as const

export const maintenancePriorities = ["Urgent", "Regular"] as const

export const maintenanceRequestStatuses = [
  "Pending Approval",
  "Approved",
  "In Progress",
  "Completed",
  "Closed",
  "Returned",
  "Rejected",
] as const

export type MaintenanceCategory = (typeof maintenanceCategories)[number]
export type MaintenancePriority = (typeof maintenancePriorities)[number]
export type MaintenanceRequestStatus =
  (typeof maintenanceRequestStatuses)[number]

export function maintenanceManagerTransition(input: {
  action: "approve" | "reject" | "return"
  category: MaintenanceCategory
  priority: MaintenancePriority
  status: MaintenanceRequestStatus
}) {
  if (input.status !== "Pending Approval") {
    throw new Error("Only pending maintenance requests can be reviewed.")
  }

  const status =
    input.action === "approve"
      ? "Approved"
      : input.action === "return"
        ? "Returned"
        : "Rejected"

  return {
    category: input.category,
    priority: input.priority,
    status,
  } satisfies {
    category: MaintenanceCategory
    priority: MaintenancePriority
    status: MaintenanceRequestStatus
  }
}

export function maintenanceTradeTransition(
  status: MaintenanceRequestStatus,
  action: "start" | "complete"
): MaintenanceRequestStatus {
  if (action === "start") {
    if (status !== "Approved") {
      throw new Error("Approved maintenance requests can be started.")
    }
    return "In Progress"
  }

  if (status !== "In Progress") {
    throw new Error("In-progress maintenance requests can be completed.")
  }
  return "Completed"
}

export function maintenanceRequestIsVisibleTo(
  request: {
    department: string
    finalCategory: MaintenanceCategory | null
    status: MaintenanceRequestStatus
  },
  viewer: {
    department?: string
    manager?: boolean
    trade?: MaintenanceCategory
  }
) {
  if (viewer.manager) return true
  if (
    viewer.department &&
    viewer.department.localeCompare(request.department, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return true
  }
  return Boolean(
    viewer.trade &&
    viewer.trade === request.finalCategory &&
    !["Pending Approval", "Returned", "Rejected"].includes(request.status)
  )
}
