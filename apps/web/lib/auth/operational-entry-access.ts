import {
  parseProductionFloorCode,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"
import {
  operationalEntryCapability,
  productionOperationalEntries,
  type ProductionOperationalEntry,
} from "./operational-entry-capabilities"

export class OperationalEntryAccessError extends Error {
  readonly status = 400
}

export function isProductionOperationalEntry(
  entry: string
): entry is ProductionOperationalEntry {
  return productionOperationalEntries.some(({ id }) => id === entry)
}

export function operationalEntryWriteScope(
  entry: string,
  action: "save" | "import",
  requestedFloor: unknown,
  payload: Record<string, unknown>
) {
  const payloadFloor = payload.productionFloorCode ?? payload.productionFloor
  const floor = parseProductionFloorCode(requestedFloor ?? payloadFloor)
  if (!floor || !isProductionOperationalEntry(entry))
    throw new OperationalEntryAccessError(
      "A valid operational entry and Production Unit are required."
    )
  if (payloadFloor != null && parseProductionFloorCode(payloadFloor) !== floor)
    throw new OperationalEntryAccessError(
      "The entry must belong to the selected Production Unit."
    )
  return {
    entry,
    floor,
    capability: operationalEntryCapability(entry, action, floor),
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const sources = {
  work_order: "workOrders",
  rm_inward: "rmInwardRows",
  software_raw: "productionOutputRows",
} as const

export function operationalEntrySnapshot(
  payload: unknown,
  entry: ProductionOperationalEntry,
  floor: ProductionFloorCode
) {
  const source = record(payload)
  const dataEntry = record(source.dataEntry)
  const rowsForUnit = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((value: unknown) => {
          const row = record(value)
          const nested = record(row.payload ?? row.sourcePayload)
          const rowFloor =
            row.productionFloorCode ??
            row.productionFloor ??
            nested.productionFloorCode ??
            nested.productionFloor
          // The repository scopes legacy rows without an explicit unit before this adapter.
          return (
            rowFloor == null || parseProductionFloorCode(rowFloor) === floor
          )
        })
      : []
  return {
    cacheStatus: source.cacheStatus,
    updatedAt: source.updatedAt,
    readModelVersion: source.readModelVersion,
    productionFloorCode: floor,
    dataEntry: {
      entryTypes: [entry],
      rows: rowsForUnit(dataEntry.rows).filter(
        (row: unknown) => record(row).entryType === entry
      ),
    },
    productionControl: {
      [sources[entry]]: rowsForUnit(
        record(source.productionControl)[sources[entry]]
      ),
    },
  }
}
