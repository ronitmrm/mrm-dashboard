import { qualityInspectionReadingResult } from "./quality-parameter-set"

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
  inputType: string
  name: string
  readings: string[]
  readingResults: string[]
  result: string
  specification: string
  tolerance: string
  toleranceMinus: string
  tolerancePlus: string
}

export type FirstPieceReportView = {
  approvedBy: string
  dimensions: FirstPieceReportDimension[]
  id: string
  inspectedAt: string
  jobCardNumber: string
  machineNumber: string
  optionNumber: string
  partCode: string
  remark: string
  result: string
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
  const dimensions = records(row.dimensions).map((dimension) => {
    const readings = Array.isArray(dimension.readings)
      ? dimension.readings.map(text)
      : []
    const inputType = first(dimension, "inputType")
    const specification = first(dimension, "specification", "nominalValue")
    const toleranceMinus = first(dimension, "toleranceMinus", "lowerTolerance")
    const tolerancePlus = first(dimension, "tolerancePlus", "upperTolerance")
    const results = readings.map((reading) =>
      qualityInspectionReadingResult(
        {
          inputType,
          specification,
          toleranceMinus,
          tolerancePlus,
        },
        reading
      )
    )
    const result = results.some((readingResult) => readingResult === "Not OK")
      ? "Not OK"
      : readings.length < 5 || readings.slice(0, 5).some((reading) => !reading)
        ? "Pending"
        : "OK"

    return {
      code: first(dimension, "parameterCode", "code", "uid"),
      inputType,
      name: first(dimension, "parameterName", "description", "name"),
      readings,
      readingResults: results,
      result,
      specification,
      tolerance: tolerance(dimension),
      toleranceMinus,
      tolerancePlus,
    }
  })
  const jobCardNumber = first(row, "jcNo", "jobCardNumber", "jobCard")
  const machineNumber = first(row, "machine", "machineNumber", "machineNo")
  const optionNumber = first(row, "optionNumber", "optionNo")
  const partCode = first(row, "partCode", "partNo", "itemCode")
  const setupNumber = first(row, "setupNo", "setupNumber", "operationSetupCode")
  const result = dimensions.some((dimension) => dimension.result === "Not OK")
    ? "Not OK"
    : dimensions.length === 0 ||
        dimensions.some((dimension) => dimension.result === "Pending")
      ? "Pending"
      : "OK"

  return {
    approvedBy: first(row, "approvedBy", "inspectedBy", "legacyInspector"),
    dimensions,
    id:
      first(row, "reportId", "key", "id", "_id") ||
      [jobCardNumber, partCode, optionNumber, setupNumber, machineNumber, "fpi"]
        .map((value) => value.toLowerCase())
        .join("|"),
    inspectedAt: first(
      row,
      "taskCompletedAt",
      "savedAt",
      "inspectedAt",
      "createdAt"
    ),
    jobCardNumber,
    machineNumber,
    optionNumber,
    partCode,
    remark: first(row, "remark", "notes"),
    result,
    setupNumber,
    status: first(row, "status", "result") || "Approved",
  }
}
