export function selectedEnquiryLine<T extends { id: string }>(
  lines: readonly T[],
  requestedLineId: string | undefined
) {
  if (!requestedLineId) return undefined

  return lines.find((line) => line.id === requestedLineId)
}
