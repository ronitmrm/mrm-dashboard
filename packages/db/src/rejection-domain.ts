export const rejectionStages = [
  "Checking",
  "Assembly",
  "Quality Control",
] as const
export type RejectionStage = (typeof rejectionStages)[number]

export type RejectionRegisterRow = {
  id: string
  jobCard: string
  partCode: string
  date: string
  unit: string
  stage: string
  type: string
  defect: string
  reason: string
  pieces: number
  kg: number | null
  weightBasis: string
}

export function validateRejectionEntry(input: {
  date: string
  stage: string
  pieces: number
  kg: number
}) {
  if (!rejectionStages.some((stage) => stage === input.stage))
    throw new Error("Select Checking, Assembly or Quality Control.")
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !Number.isFinite(Date.parse(input.date)) ||
    new Date(input.date).toISOString().slice(0, 10) !== input.date
  )
    throw new Error("Enter a valid rejection date.")
  if (
    !Number.isSafeInteger(input.pieces) ||
    input.pieces <= 0 ||
    input.pieces > 2147483647
  )
    throw new Error("Enter a positive whole number of pieces.")
  if (!Number.isFinite(input.kg) || input.kg < 0.001 || input.kg >= 1e12)
    throw new Error("Enter rejected kg, at least 0.001.")
}

export function productionRejectionStage(type: string) {
  if (/in[ -]?process.*setting/i.test(type)) return "In-process setting"
  if (/setup|setting/i.test(type)) return "Setup"
  return "In-process"
}
