type QualityParameterCombination = {
  parameterName: unknown
  specification: unknown
}

type QualityInspectionParameterRow = Record<string, unknown>

export function hasNonNumericQualityTolerance(row: Record<string, unknown>) {
  return [row.tolerancePlus, row.toleranceMinus].some((value) => {
    const text = String(value ?? "").trim()
    return text !== "" && !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)
  })
}

export function normalizeQualityParameterInputType(value: unknown) {
  const inputType = String(value ?? "").trim().toLowerCase()
  if (["pass_fail", "pass/fail", "ok/not ok", "ok / not ok", "checkbox", "boolean", "yes_no"].includes(inputType)) return "pass_fail"
  return inputType === "text" ? "text" : "number"
}

export function qualityInspectionParameterInputType(
  row: QualityInspectionParameterRow
) {
  const inputType = normalizeQualityParameterInputType(row.inputType)
  return inputType === "number" && hasNonNumericQualityTolerance(row)
    ? "text"
    : inputType
}

export function qualityInspectionReadingResult(
  parameter: QualityInspectionParameterRow,
  value: unknown
) {
  const reading = String(value ?? "").trim()
  if (!reading) return ""
  if (qualityInspectionParameterInputType(parameter) === "pass_fail") {
    const normalized = reading.toLowerCase()
    return normalized === "ok" || normalized === "pass" ? "OK" : "Not OK"
  }

  const numericReading = Number(reading)
  const specification = Number(String(parameter.specification ?? "").trim())
  if (!Number.isFinite(numericReading) || !Number.isFinite(specification)) {
    return "Recorded"
  }
  const plus = Number(String(parameter.tolerancePlus ?? 0).trim())
  const minus = Number(String(parameter.toleranceMinus ?? 0).trim())
  const lower = specification - (Number.isFinite(minus) ? minus : 0)
  const upper = specification + (Number.isFinite(plus) ? plus : 0)
  return numericReading >= lower && numericReading <= upper ? "OK" : "Not OK"
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("en-IN")
}

function normalizedSpecification(value: unknown) {
  const text = normalized(value)
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return text
  return String(Number(text))
}

function parameterRowKey(row: QualityInspectionParameterRow) {
  return [
    row.partNo || row.partCode || row.uid,
    row.optionNumber,
    row.setupNo,
    row.parameterName || row.description,
    normalizedSpecification(row.specification),
  ]
    .map(normalized)
    .join("|")
}

function setupKey(row: QualityInspectionParameterRow) {
  return [row.partNo || row.partCode || row.uid, row.optionNumber, row.setupNo]
    .map(normalized).join("|")
}

function isActive(row: QualityInspectionParameterRow) {
  return normalized(row.status || "Active") !== "inactive"
}

export function duplicateQualityParameterCombination(
  rows: readonly QualityParameterCombination[]
) {
  const seen = new Set<string>()
  for (const row of rows) {
    const parameterName = normalized(row.parameterName)
    const specification = normalized(row.specification)
    const key = `${parameterName}|${specification}`
    if (seen.has(key)) return { parameterName, specification }
    seen.add(key)
  }
  return undefined
}

export function mergeQualityInspectionParameterRows(
  currentRows: readonly QualityInspectionParameterRow[],
  legacyRows: readonly QualityInspectionParameterRow[]
) {
  const rowsByParameter = new Map<string, QualityInspectionParameterRow>()
  // A current setup owns its complete parameter set, including removals and ECNs.
  const currentSetups = new Set(currentRows.map(setupKey))
  const fallbackRows = legacyRows.filter((row) => !currentSetups.has(setupKey(row)))
  for (const row of [...currentRows, ...fallbackRows]) {
    if (!isActive(row)) continue
    const key = parameterRowKey(row)
    if (!key.replaceAll("|", "") || rowsByParameter.has(key)) continue
    rowsByParameter.set(key, row)
  }
  return [...rowsByParameter.values()]
}
