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

export function qualityParameterValuePlan(payload: Record<string, unknown>) {
  const number = (value: unknown) => {
    if (value === null || value === undefined || value === "") return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const nominalValue = number(payload.specification)
  const plus = number(payload.tolerancePlus)
  const minus = number(payload.toleranceMinus)
  const inputType = normalizeQualityParameterInputType(payload.inputType)
  if (inputType === "number" && hasNonNumericQualityTolerance(payload)) {
    throw new Error("Text tolerances require Text or Ok / Not Ok input, not Number.")
  }
  const dataType = inputType === "number" ? "numeric" : inputType === "pass_fail" ? "boolean" : "text"
  return {
    dataType, inputType, nominalValue,
    lowerLimit: nominalValue !== undefined && minus !== undefined ? nominalValue - Math.abs(minus) : undefined,
    upperLimit: nominalValue !== undefined && plus !== undefined ? nominalValue + Math.abs(plus) : undefined,
  } as const
}
