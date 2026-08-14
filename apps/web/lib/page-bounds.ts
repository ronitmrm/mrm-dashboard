export function pageBounds(value: unknown, limit: number) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === "string" ? Number(raw) : Number.NaN
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1

  return { limit, offset: (page - 1) * limit, page }
}
