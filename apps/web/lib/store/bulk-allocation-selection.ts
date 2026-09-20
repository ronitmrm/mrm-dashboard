type AllocationLine = {
  availableUnitIds: string[]
  id: string
  itemTypeId: string
  remainingQuantity: number
  trackingMode: "BULK" | "SERIALIZED"
}

function serializedSlots(lines: AllocationLine[]) {
  return lines.flatMap((line) =>
    line.trackingMode === "SERIALIZED"
      ? Array.from({ length: line.remainingQuantity }, (_, index) => ({
          key: `${line.id}:${index}`,
          line,
        }))
      : []
  )
}

function unitKey(line: AllocationLine, unitId: string) {
  return `${line.itemTypeId}:${unitId.toLowerCase()}`
}

export function serializedAllocationSelections(
  lines: AllocationLine[],
  current: Record<string, string>
) {
  const slots = serializedSlots(lines)
  const next: Record<string, string> = {}
  const usedUnits = new Set<string>()

  for (const slot of slots) {
    const currentUnitId = current[slot.key]
    const availableUnitId = slot.line.availableUnitIds.find(
      (unitId) => unitId.toLowerCase() === currentUnitId?.toLowerCase()
    )
    if (!availableUnitId) continue
    const key = unitKey(slot.line, availableUnitId)
    if (usedUnits.has(key)) continue
    next[slot.key] = availableUnitId
    usedUnits.add(key)
  }

  for (const slot of slots) {
    if (slot.line.remainingQuantity !== 1 || next[slot.key]) continue
    const availableUnitId = slot.line.availableUnitIds.find(
      (unitId) => !usedUnits.has(unitKey(slot.line, unitId))
    )
    if (!availableUnitId) continue
    next[slot.key] = availableUnitId
    usedUnits.add(unitKey(slot.line, availableUnitId))
  }

  return next
}
