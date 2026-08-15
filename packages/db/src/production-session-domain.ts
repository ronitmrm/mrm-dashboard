export type ProductionMeasurementMethod = "counter" | "weight"

type ProductionContext = {
  jobCardNumber: string
  machineNumber: string
  optionNumber: string
  partCode: string
  setupNumber: string
}

type PreviousProductionSession = ProductionContext & {
  endCount: number | null
  measurementMethod: ProductionMeasurementMethod
  status: "closed" | "open"
}

type ProductionSessionOutputInput =
  | {
      endCount: number
      measurementMethod: "counter"
      rejectedPieces: number
      startCount: number
    }
  | {
      crateCount: number
      crateWeightKg: number
      grossWeightKg: number
      measurementMethod: "weight"
      pieceWeightGrams: number
      rejectedPieces: number
    }

export type ProductionSessionOutput = {
  goodPieces: number
  netWeightKg: number | null
  rejectedPieces: number
  totalPieces: number
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number.`)
  }
  return value
}

export function calculateProductionSessionOutput(
  input: ProductionSessionOutputInput
): ProductionSessionOutput {
  const rejectedPieces = nonNegativeInteger(
    input.rejectedPieces,
    "Rejected pieces"
  )
  let netWeightKg: number | null = null
  let totalPieces = 0

  if (input.measurementMethod === "counter") {
    const startCount = nonNegativeInteger(input.startCount, "Start count")
    const endCount = nonNegativeInteger(input.endCount, "End count")
    if (endCount < startCount) {
      throw new Error("End count cannot be lower than start count.")
    }
    totalPieces = endCount - startCount
  } else {
    if (!(input.grossWeightKg >= 0)) {
      throw new Error("Gross produced weight cannot be negative.")
    }
    if (!(input.crateCount >= 0) || !Number.isSafeInteger(input.crateCount)) {
      throw new Error("Crates used must be a non-negative whole number.")
    }
    if (!(input.crateWeightKg >= 0)) {
      throw new Error("Crate weight cannot be negative.")
    }
    if (!(input.pieceWeightGrams > 0)) {
      throw new Error("Piece weight must be greater than zero.")
    }
    netWeightKg = Math.max(
      input.grossWeightKg - input.crateCount * input.crateWeightKg,
      0
    )
    totalPieces = Math.floor((netWeightKg * 1000) / input.pieceWeightGrams)
  }

  if (rejectedPieces > totalPieces) {
    throw new Error("Rejected pieces cannot exceed total produced pieces.")
  }

  return {
    goodPieces: totalPieces - rejectedPieces,
    netWeightKg,
    rejectedPieces,
    totalPieces,
  }
}

export function suggestedCounterStart(
  current: ProductionContext,
  previous: PreviousProductionSession | null | undefined
) {
  if (
    !previous ||
    previous.status !== "closed" ||
    previous.measurementMethod !== "counter" ||
    previous.endCount === null
  ) {
    return null
  }
  const keys = [
    "jobCardNumber",
    "machineNumber",
    "optionNumber",
    "partCode",
    "setupNumber",
  ] as const
  return keys.every(
    (key) =>
      current[key].trim().toLowerCase() === previous[key].trim().toLowerCase()
  )
    ? previous.endCount
    : null
}
