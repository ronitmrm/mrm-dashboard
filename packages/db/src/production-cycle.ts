export function isBlastingMachine(machineType: unknown) {
  return /\bblasting\s+machine\b/i.test(String(machineType ?? ""))
}

export function weightBatchCycleTimeSeconds(input: {
  batchWeightKg: unknown
  batchTimeMinutes: unknown
  pieceWeightGrams: unknown
}) {
  const batchWeightKg = Number(input.batchWeightKg)
  const batchTimeMinutes = Number(input.batchTimeMinutes)
  const pieceWeightGrams = Number(input.pieceWeightGrams)
  if (!Number.isFinite(batchWeightKg) || batchWeightKg <= 0) {
    throw new Error("Batch weight (kg) must be greater than zero.")
  }
  if (!Number.isFinite(batchTimeMinutes) || batchTimeMinutes <= 0) {
    throw new Error("Batch time (minutes) must be greater than zero.")
  }
  if (!Number.isFinite(pieceWeightGrams) || pieceWeightGrams <= 0) {
    throw new Error("Stage Weight in Route Master must be greater than zero.")
  }
  return batchTimeMinutes * 60 * pieceWeightGrams / (batchWeightKg * 1000)
}
