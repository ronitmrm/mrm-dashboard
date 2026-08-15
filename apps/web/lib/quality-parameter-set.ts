type QualityParameterCombination = {
  parameterName: unknown
  specification: unknown
}

type QualityInspectionParameterRow = Record<string, unknown>

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
  for (const row of [...currentRows, ...legacyRows]) {
    if (!isActive(row)) continue
    const key = parameterRowKey(row)
    if (!key.replaceAll("|", "") || rowsByParameter.has(key)) continue
    rowsByParameter.set(key, row)
  }
  return [...rowsByParameter.values()]
}
