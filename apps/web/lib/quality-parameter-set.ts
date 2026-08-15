type QualityParameterCombination = {
  parameterName: unknown
  specification: unknown
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("en-IN")
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
