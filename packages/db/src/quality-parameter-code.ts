/** The same identity is used when importing and displaying a parameter. */
export function qualityParameterCode(payload: Record<string, unknown>) {
  const text = (value: unknown) => String(value ?? "").trim()
  return (
    text(payload.code || payload.parameterCode) ||
    [payload.parameterName || payload.description, payload.specification]
      .map(text)
      .filter(Boolean)
      .join("|") ||
    text(payload.uid)
  )
}
