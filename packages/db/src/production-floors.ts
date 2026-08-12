export const productionFloors = [
  {
    code: "conventional",
    label: "Conventional-01 Production Department",
    shortLabel: "Conventional-01",
  },
  {
    code: "conventional-02",
    label: "Conventional-02 Production Department",
    shortLabel: "Conventional-02",
  },
  {
    code: "cnc",
    label: "Production Planning & Control CNC-01",
    shortLabel: "CNC-01",
  },
  {
    code: "forging",
    label: "Forging Production Floor",
    shortLabel: "Forging",
  },
] as const

export type ProductionFloorCode = (typeof productionFloors)[number]["code"]

export const defaultProductionFloorCode: ProductionFloorCode = "conventional"

const productionFloorCodes = new Set<string>(
  productionFloors.map((floor) => floor.code)
)

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function normalizeProductionFloorCode(
  value: unknown
): ProductionFloorCode {
  const code = text(value)
  return productionFloorCodes.has(code)
    ? (code as ProductionFloorCode)
    : defaultProductionFloorCode
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
