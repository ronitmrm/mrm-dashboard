export const productionFloors = [
  {
    code: "conventional",
    label: "PPAC Conventional-01",
    shortLabel: "Conventional-01",
  },
  {
    code: "conventional-02",
    label: "PPAC Conventional-02",
    shortLabel: "Conventional-02",
  },
  {
    code: "cnc",
    label: "PPAC CNC-01",
    shortLabel: "CNC-01",
  },
  {
    code: "forging",
    label: "PPAC Forging",
    shortLabel: "Forging",
  },
] as const

export type ProductionFloorCode = (typeof productionFloors)[number]["code"]

export const defaultProductionFloorCode: ProductionFloorCode = "conventional"

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function comparableFloorName(value: unknown) {
  return text(value)
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function parseProductionFloorCode(
  value: unknown
): ProductionFloorCode | null {
  const name = comparableFloorName(value)
  if (!name) return null

  for (const floor of productionFloors) {
    if (
      [floor.code, floor.label, floor.shortLabel]
        .map(comparableFloorName)
        .includes(name)
    ) {
      return floor.code
    }
  }

  if (name.endsWith("conventional 01")) return "conventional"
  if (name.endsWith("conventional 02")) return "conventional-02"
  if (name.endsWith("cnc 01")) return "cnc"
  if (name.endsWith("forging")) return "forging"
  return null
}

export function normalizeProductionFloorCode(
  value: unknown
): ProductionFloorCode {
  return parseProductionFloorCode(value) ?? defaultProductionFloorCode
}

export function productionFloorCodeForRecord(
  value: unknown
): ProductionFloorCode {
  const row = record(value)
  const payload = record(row.payload)
  const sourcePayload = record(row.sourcePayload)
  return normalizeProductionFloorCode(
    row.productionFloorCode ??
      row.productionFloor ??
      payload.productionFloorCode ??
      payload.productionFloor ??
      sourcePayload.productionFloorCode ??
      sourcePayload.productionFloor
  )
}

export function withProductionFloor<T extends Record<string, unknown>>(
  value: T,
  productionFloorCode: ProductionFloorCode
) {
  return {
    ...value,
    productionFloorCode,
  }
}
