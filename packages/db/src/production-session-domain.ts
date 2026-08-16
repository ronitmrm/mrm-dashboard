export type ProductionMeasurementMethod = "counter" | "weight"
export type ProductionDowntimeEndOutcome =
  | "resolved"
  | "shift_end_unresolved"
export type ProductionSessionOperationalStatus =
  | "closed"
  | "closing_required"
  | "open"

export type ProductionShiftContext = {
  productionDate: string
  shift: "A" | "B" | "C" | "General"
}

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

export function productionDowntimeEndOutcome(value: string) {
  if (value === "resolved" || value === "shift_end_unresolved") {
    return value satisfies ProductionDowntimeEndOutcome
  }
  throw new Error("A valid downtime closure outcome is required.")
}

export function assertProductionSessionCanClose(input: {
  hasOpenDowntime: boolean
}) {
  if (input.hasOpenDowntime) {
    throw new Error(
      "Close the open downtime before ending the production session."
    )
  }
}

function localProductionClock(instant: Date) {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("Production time is invalid.")
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  const date = `${value("year")}-${value("month")}-${value("day")}`
  const hour = Number(value("hour")) % 24
  const minute = Number(value("minute"))
  return { date, minutes: hour * 60 + minute }
}

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function productionShiftEndInstant(input: {
  productionDate: string
  productionFloorCode: string
  shift: string
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.productionDate)) {
    throw new Error("Production date must use YYYY-MM-DD.")
  }
  const floor = input.productionFloorCode.trim().toLowerCase()
  if (floor === "cnc") {
    const shiftEnd = {
      A: [input.productionDate, "14:00"],
      B: [input.productionDate, "22:00"],
      C: [nextDate(input.productionDate), "06:00"],
    }[input.shift]
    if (!shiftEnd) throw new Error("A valid CNC production shift is required.")
    return new Date(`${shiftEnd[0]}T${shiftEnd[1]}:00.000+05:30`)
  }
  if (
    ["conventional", "conventional-02", "forging"].includes(floor) &&
    input.shift === "General"
  ) {
    return new Date(`${input.productionDate}T20:00:00.000+05:30`)
  }
  throw new Error("A valid Production Floor shift is required.")
}

export function productionSessionOperationalStatus(
  input: {
    productionDate: string
    productionFloorCode: string
    shift: string
    status: "closed" | "open"
  },
  instant: Date
): ProductionSessionOperationalStatus {
  if (input.status === "closed") return "closed"
  if (Number.isNaN(instant.getTime())) {
    throw new Error("Production time is invalid.")
  }
  return instant >= productionShiftEndInstant(input)
    ? "closing_required"
    : "open"
}

export function productionShiftAt(
  productionFloorCode: string,
  instant: Date
): ProductionShiftContext | null {
  const floor = productionFloorCode.trim().toLowerCase()
  const { date, minutes } = localProductionClock(instant)

  if (floor === "cnc") {
    if (minutes >= 6 * 60 && minutes < 14 * 60) {
      return { productionDate: date, shift: "A" }
    }
    if (minutes >= 14 * 60 && minutes < 22 * 60) {
      return { productionDate: date, shift: "B" }
    }
    return {
      productionDate: minutes < 6 * 60 ? previousDate(date) : date,
      shift: "C",
    }
  }

  if (
    ["conventional", "conventional-02", "forging"].includes(floor) &&
    minutes >= 8 * 60 + 30 &&
    minutes < 20 * 60
  ) {
    return { productionDate: date, shift: "General" }
  }

  return null
}

export function formatProductionSessionReference(input: {
  dailySequence: number
  machineNumber: string
  productionDate: string
}) {
  if (!Number.isSafeInteger(input.dailySequence) || input.dailySequence < 1) {
    throw new Error("Daily session sequence must be a positive whole number.")
  }
  const machineNumber = input.machineNumber.trim().toUpperCase()
  if (!machineNumber) throw new Error("Machine number is required.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.productionDate)) {
    throw new Error("Production date must use YYYY-MM-DD.")
  }
  return `${machineNumber}-${input.productionDate.replaceAll("-", "")}-${String(input.dailySequence).padStart(2, "0")}`
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
