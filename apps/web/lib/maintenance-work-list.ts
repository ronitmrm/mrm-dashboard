type ScheduledWork = Record<string, unknown> & {
  assetCode?: unknown
  machineNo?: unknown
  maintenanceTitle?: unknown
  nextDueDate?: unknown
  status?: unknown
}

type RequestWork = {
  assigneeName: string | null
  finalPriority: "Urgent" | "Regular" | null
  id: string
  location: string
  problemDescription: string
  requestedPriority?: "Urgent" | "Regular"
  status: string
  submittedAt: string
}

export type UnifiedMechanicalWorkRow =
  | {
      assignee: string | null
      date: string
      description: string
      machineOrLocation: string
      priority: "Scheduled"
      scheduled: ScheduledWork
      status: string
      workType: "Scheduled"
    }
  | {
      assignee: string | null
      date: string
      description: string
      machineOrLocation: string
      priority: "Urgent" | "Regular"
      requestId: string
      status: string
      workType: "Request"
    }

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function plannedMaintenanceScheduleRows<
  Row extends { generated?: unknown; legacyHistory?: unknown; machine?: unknown; machineNo?: unknown; maintenanceCode?: unknown; status?: unknown },
>(rows: Row[]): Row[] {
  return rows.filter((row) =>
    !row.generated &&
    !row.legacyHistory &&
    text(row.machineNo || row.machine).trim() &&
    text(row.maintenanceCode).trim() &&
    text(row.maintenanceCode).toUpperCase() !== "BREAKDOWN" &&
    text(row.status).toLowerCase() !== "inactive"
  )
}

const priorityRank: Record<UnifiedMechanicalWorkRow["priority"], number> = {
  Urgent: 0,
  Scheduled: 1,
  Regular: 2,
}

export function unifiedMechanicalWorkRows(
  scheduledRows: ScheduledWork[],
  requestRows: RequestWork[]
): UnifiedMechanicalWorkRow[] {
  const scheduled: UnifiedMechanicalWorkRow[] = scheduledRows.map((row) => ({
    assignee: null,
    date: text(row.nextDueDate),
    description: text(row.maintenanceTitle),
    machineOrLocation: text(row.assetCode || row.machineNo),
    priority: "Scheduled",
    scheduled: row,
    status: text(row.status),
    workType: "Scheduled",
  }))
  const requests: UnifiedMechanicalWorkRow[] = requestRows.map((row) => ({
    assignee: row.assigneeName,
    date: row.submittedAt,
    description: row.problemDescription,
    machineOrLocation: row.location,
    priority: row.finalPriority ?? row.requestedPriority ?? "Regular",
    requestId: row.id,
    status: row.status,
    workType: "Request",
  }))

  return [...scheduled, ...requests].sort(
    (left, right) =>
      priorityRank[left.priority] - priorityRank[right.priority] ||
      left.date.localeCompare(right.date)
  )
}
