export type QualityWorkspaceRecord = Record<string, unknown>

export type QualityDowntimeRestartTask = {
  eventId: string
  jobCardNumber: string
  machineNumber: string
  partCode: string
  reasonName: string
  sessionId: string
  sessionReference: string
  setupNumber: string
  startedAt: string
}

export type FirstPieceReportDimension = {
  code: string
  name: string
  readings: string[]
  specification: string
  tolerance: string
}

export type FirstPieceReportView = {
  approvedBy: string
  dimensions: FirstPieceReportDimension[]
  inspectedAt: string
  jobCardNumber: string
  machineNumber: string
  optionNumber: string
  partCode: string
  remark: string
  setupNumber: string
  status: string
}

function text(value: unknown) {
  return String(value ?? "").trim()
}

function records(value: unknown): QualityWorkspaceRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is QualityWorkspaceRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : []
}

function first(row: QualityWorkspaceRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = text(row[key])
    if (value) return value
  }
  return ""
}

export function qualityDowntimeRestartTasks(
  sessions: readonly QualityWorkspaceRecord[]
) {
  const tasks: QualityDowntimeRestartTask[] = []
  for (const session of sessions) {
    if (text(session.status).toLowerCase() !== "open") continue
    for (const event of records(session.downtimeEvents)) {
      if (
        text(event.enteredRole).toLowerCase() !== "quality" ||
        text(event.endedAt) ||
        event.breakdownLinked === true
      ) {
        continue
      }
      tasks.push({
        eventId: text(event.id),
        jobCardNumber: first(session, "jobCardNumber", "jobCard", "jcNo"),
        machineNumber: first(session, "machineNumber", "machineNo", "machine"),
        partCode: first(session, "partCode", "partNo", "itemCode"),
        reasonName:
          first(event, "reasonName", "reasonCode") || "Quality downtime",
        sessionId: text(session.id),
        sessionReference: text(session.sessionReference),
        setupNumber: first(
          session,
          "setupNumber",
          "setupNo",
          "operationSetupCode"
        ),
        startedAt: text(event.startedAt),
      })
    }
  }
  return tasks.sort(
    (left, right) =>
      left.machineNumber.localeCompare(right.machineNumber, "en-IN", {
        numeric: true,
      }) || left.startedAt.localeCompare(right.startedAt)
  )
}

function tolerance(dimension: QualityWorkspaceRecord) {
  const explicit = first(dimension, "tolerance")
  if (explicit) return explicit
  const plus = first(dimension, "tolerancePlus", "upperTolerance")
  const minus = first(dimension, "toleranceMinus", "lowerTolerance")
  if (!plus && !minus) return ""
  return `${plus ? `+${plus}` : "+-"} / ${minus ? `-${minus}` : "--"}`
}

export function firstPieceReportView(
  row: QualityWorkspaceRecord
): FirstPieceReportView {
  return {
    approvedBy: first(row, "approvedBy", "inspectedBy", "legacyInspector"),
    inspectedAt: first(
      row,
      "taskCompletedAt",
      "savedAt",
      "inspectedAt",
      "createdAt"
    ),
    jobCardNumber: first(row, "jcNo", "jobCardNumber", "jobCard"),
    machineNumber: first(row, "machine", "machineNumber", "machineNo"),
    optionNumber: first(row, "optionNumber", "optionNo"),
    partCode: first(row, "partCode", "partNo", "itemCode"),
    remark: first(row, "remark", "notes"),
    setupNumber: first(row, "setupNo", "setupNumber", "operationSetupCode"),
    status: first(row, "status", "result") || "Approved",
    dimensions: records(row.dimensions).map((dimension) => ({
      code: first(dimension, "parameterCode", "code", "uid"),
      name: first(dimension, "parameterName", "description", "name"),
      readings: Array.isArray(dimension.readings)
        ? dimension.readings.map(text)
        : [],
      specification: first(dimension, "specification", "nominalValue"),
      tolerance: tolerance(dimension),
    })),
  }
}
