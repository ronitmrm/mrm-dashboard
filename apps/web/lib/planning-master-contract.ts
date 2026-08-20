type PlanningRow = Record<string, unknown>

type PlanningMasterKind = "cycle" | "tooling"

function text(value: unknown) {
  return String(value ?? "").trim()
}

function uniqueText(rows: readonly PlanningRow[], field: string) {
  const values = new Map<string, string>()
  for (const row of rows) {
    const value = text(row[field])
    if (value && !values.has(value.toLowerCase())) {
      values.set(value.toLowerCase(), value)
    }
  }
  return [...values.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  )
}

export function routeMasterLineKey(row: PlanningRow) {
  return [row.partNo ?? row.partCode, row.optionNumber, row.setupNo]
    .map((value) => text(value).toLowerCase())
    .join("|")
}

export function routeMasterLineOptions(rows: readonly PlanningRow[]) {
  const lines = new Map<string, PlanningRow>()
  for (const row of rows) {
    const key = routeMasterLineKey(row)
    if (key.replaceAll("|", "")) lines.set(key, row)
  }
  return [...lines.entries()]
    .map(([key, value]) => ({
      key,
      label: [
        text(value.partNo ?? value.partCode),
        `Option ${text(value.optionNumber)}`,
        `Setup ${text(value.setupNo)}`,
        text(value.setupName),
      ]
        .filter(Boolean)
        .join(" · "),
      value,
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true })
    )
}

export function machineFamilyOptions(rows: readonly PlanningRow[]) {
  return uniqueText(rows, "machineFamily")
}

export function setupNameOptions(rows: readonly PlanningRow[]) {
  return uniqueText(rows, "setupName")
}

export function planningMasterPayload(
  kind: PlanningMasterKind,
  routeLine: PlanningRow,
  input: PlanningRow
) {
  const routeIdentity = {
    machineFamily: text(routeLine.machineFamily),
    machineType: text(routeLine.machineType),
    optionNumber: text(routeLine.optionNumber),
    partNo: text(routeLine.partNo ?? routeLine.partCode),
    setupName: text(routeLine.setupName),
    setupNo: text(routeLine.setupNo),
    stageWeight: text(routeLine.stageWeight),
  }

  if (kind === "cycle") {
    return {
      cycleTime: text(input.cycleTime),
      ...routeIdentity,
    }
  }

  return {
    fixture: text(input.fixture),
    foamTool: text(input.foamTool),
    ...routeIdentity,
    remarks: text(input.remarks),
    tooling: text(input.tooling),
  }
}
