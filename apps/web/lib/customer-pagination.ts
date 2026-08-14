const customerPageSize = 15

export function customerPageBounds(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === "string" ? Number(raw) : Number.NaN
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1

  return {
    limit: customerPageSize,
    offset: (page - 1) * customerPageSize,
    page,
  }
}
