type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function cleanedText(value: unknown) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function planningSetupNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined
  }
  const match = cleanedText(value).match(/\d+/)
  if (!match) return undefined
  const parsed = Number(match[0])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function normalizeInterruptedSetups(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const rows = value.flatMap((candidate) => {
    const row = record(candidate)
    if (!row) return []
    const jobCardNumber = cleanedText(row.jcNo)
    const machineNumber = cleanedText(row.machine)
    const setupNumber = planningSetupNumber(row.setupNo)
    if (!jobCardNumber || !machineNumber || !setupNumber) return []
    const finishedQuantity = optionalNumber(row.finishedQty)
    return [
      {
        ...(finishedQuantity === undefined ? {} : { finishedQuantity }),
        jobCardNumber,
        machineNumber,
        setupNumber,
      },
    ]
  })
  return rows.length ? rows : undefined
}

export function normalizeQueueBeforeSetups(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const rows = value.flatMap((candidate) => {
    const row = record(candidate)
    if (!row) return []
    const jobCardNumber = cleanedText(row.jcNo)
    const machineNumber = cleanedText(row.machine)
    const setupNumber = planningSetupNumber(row.setupNo)
    if (!jobCardNumber || !machineNumber || !setupNumber) return []
    const targetSetupNumber = planningSetupNumber(row.targetSetupNo)
    return [
      {
        jobCardNumber,
        machineNumber,
        setupNumber,
        ...(targetSetupNumber === undefined ? {} : { targetSetupNumber }),
      },
    ]
  })
  return rows.length ? rows : undefined
}

export function normalizeQueuePlacements(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const rows = value.flatMap((candidate) => {
    const row = record(candidate)
    if (!row) return []
    const targetJobCardNumber = cleanedText(row.targetJcNo)
    const targetMachineNumber = cleanedText(row.targetMachine)
    const targetSetupNumber = planningSetupNumber(row.targetSetupNo)
    if (!targetJobCardNumber || !targetMachineNumber || !targetSetupNumber)
      return []
    const queueBeforeSetups = normalizeQueueBeforeSetups(row.queueBeforeSetups)
    const targetPartCode = cleanedText(row.targetPartCode)
    const targetSourceMachineNumber = cleanedText(row.targetSourceMachine)
    return [
      {
        ...(queueBeforeSetups ? { queueBeforeSetups } : {}),
        targetJobCardNumber,
        targetMachineNumber,
        ...(targetPartCode ? { targetPartCode } : {}),
        targetSetupNumber,
        ...(targetSourceMachineNumber ? { targetSourceMachineNumber } : {}),
      },
    ]
  })
  return rows.length ? rows : undefined
}

export function normalizeRemainingSetups(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const rows = value.flatMap((candidate) => {
    const row = record(candidate)
    if (!row) return []
    const setupNumber = planningSetupNumber(row.setupNo)
    const quantity = optionalNumber(row.quantity)
    if (!setupNumber || quantity === undefined) return []
    const remark = cleanedText(row.remark)
    return [
      {
        plan: row.plan === true,
        quantity,
        ...(remark ? { remark } : {}),
        setupNumber,
      },
    ]
  })
  return rows.length ? rows : undefined
}
