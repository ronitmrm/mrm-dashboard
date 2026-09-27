type DashboardRecord = Record<string, unknown>

function record(value: unknown): DashboardRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as DashboardRecord)
    : {}
}

function rows(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (row): row is DashboardRecord =>
          typeof row === "object" && row !== null && !Array.isArray(row)
      )
    : []
}

export function maintenanceChecklistRowsForSchedule(
  dataEntry: unknown,
  productionControl: unknown
) {
  const entry = record(dataEntry)
  const control = record(productionControl)
  return [
    ...rows(control.maintenanceChecklistMasterRows),
    ...rows(entry.maintenanceChecklistMasterRows),
    ...rows(entry.rows),
    ...rows(entry.templates),
  ].filter(
    (row) =>
      row.entryType === "maintenance_checklist_master" ||
      (typeof row.checklistCode === "string" && row.checklistCode.trim())
  )
}

export function maintenanceMasterRowsForMachineAssignment(pages: unknown[]) {
  const byCode = new Map<string, DashboardRecord>()
  const pageRecords = pages.map(record)
  const candidates = [
    ...pageRecords.flatMap((page) =>
      rows(record(page.productionControl).maintenanceMasterRows)
    ),
    ...pageRecords.flatMap((page) => {
      const entry = record(page.dataEntry)
      return [
        ...rows(entry.maintenanceMasterRows),
        ...rows(entry.rows),
        ...rows(entry.templates),
      ]
    }),
  ].filter(
    (row) =>
      row.entryType === "maintenance_master" ||
      (typeof row.maintenanceCode === "string" && row.maintenanceCode.trim())
  )

  for (const row of candidates) {
    const code = String(row.maintenanceCode ?? row.code ?? "")
      .trim()
      .toLocaleLowerCase()
    if (code) byCode.set(code, row)
  }

  return [...byCode.values()]
}

function valueText(value: unknown) {
  return value === null || value === undefined ? "" : String(value)
}

export type MaintenanceChecklistStep = {
  checklistCode: string
  checklistTitle: string
  sequence: number
  stepDescription: string
  inputType: string
  required: boolean
  value: string
  remark: string
  result: string
}

export function maintenanceChecklistStepsForSchedule(
  checklistRows: unknown,
  checklistCode: string,
  savedSteps: unknown = []
): MaintenanceChecklistStep[] {
  const savedBySequence = new Map(
    rows(savedSteps).map((step) => [Number(step.sequence), step])
  )
  const bySequence = new Map<number, MaintenanceChecklistStep>()
  for (const row of rows(checklistRows)) {
    if (
      valueText(row.checklistCode).trim().toLowerCase() !==
      checklistCode.trim().toLowerCase()
    )
      continue
    const sequence = Number(row.sequence)
    if (!Number.isInteger(sequence) || sequence < 1) continue
    if (valueText(row.status || "Active").toLowerCase() === "inactive") continue
    const saved = savedBySequence.get(sequence)
    const value = valueText(saved?.value)
    const inputType = valueText(row.inputType || "checkbox").toLowerCase()
    bySequence.set(sequence, {
      checklistCode: valueText(row.checklistCode),
      checklistTitle: valueText(row.checklistTitle),
      sequence,
      stepDescription: valueText(row.stepDescription),
      inputType,
      required:
        row.required !== false &&
        valueText(row.required ?? "Yes").toLowerCase() !== "no",
      value,
      remark: valueText(saved?.remark),
      result: value
        ? inputType === "checkbox"
          ? value === "Yes"
            ? "OK"
            : "Not OK"
          : "Recorded"
        : "",
    })
  }
  return [...bySequence.values()].sort(
    (left, right) => left.sequence - right.sequence
  )
}

export function maintenanceDowntimeReasonRows(pages: unknown[]) {
  const byCode = new Map<string, DashboardRecord>()
  const pageRecords = pages.map(record)
  const candidates = [
    ...pageRecords.flatMap((page) =>
      rows(record(page.productionControl).rejectionReasonMasterRows)
    ),
    ...pageRecords.flatMap((page) => {
      const entry = record(page.dataEntry)
      return [
        ...rows(entry.rejectionReasonMasterRows),
        ...rows(entry.rows),
        ...rows(entry.templates),
      ]
    }),
  ].filter(
    (row) =>
      row.entryType === "rejection_reason_master" ||
      (typeof row.rejectionReason === "string" && row.rejectionReason.trim()) ||
      (typeof row.downtimeReason === "string" && row.downtimeReason.trim())
  )

  for (const row of candidates) {
    if (
      String(row.status ?? "Active")
        .trim()
        .toLowerCase() === "inactive"
    ) {
      continue
    }
    const code = String(row.code ?? "")
      .trim()
      .toLowerCase()
    const name = String(
      row.rejectionReason ?? row.downtimeReason ?? row.reason ?? row.name ?? ""
    ).trim()
    if (code && name) byCode.set(code, row)
  }

  return [...byCode.values()].sort((left, right) =>
    String(left.code).localeCompare(String(right.code), undefined, {
      numeric: true,
    })
  )
}
