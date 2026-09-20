const numericText = (value: unknown) => String(value ?? "").trim()

export function formatOnePieceWeight(value: unknown) {
  const input = numericText(value)
  if (!input) return "-"
  const parsed = Number(input)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "-"
}

export function formatPiecesPerKg(value: unknown) {
  const input = numericText(value)
  if (!input) return "-"
  const parsed = Number(input)
  return Number.isFinite(parsed) ? String(Math.ceil(parsed)) : "-"
}
