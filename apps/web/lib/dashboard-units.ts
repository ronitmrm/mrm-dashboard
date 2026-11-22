import {
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"
import {
  productionShiftAt,
  productionShiftEndInstant,
} from "@workspace/db/production-session-domain"

import { istDateValue } from "./date-time"

// Production units the department dashboards can show. CNC runs three
// 8-hour shifts; the other units run one General shift, 08:30 to 20:00 IST.
export const dashboardShifts = ["A", "B", "C", "General"] as const
export type DashboardShift = (typeof dashboardShifts)[number]
export type DashboardUnit = ProductionFloorCode | "all"

const hourMs = 3_600_000

export function unitShifts(floor: ProductionFloorCode): readonly DashboardShift[] {
  return floor === "cnc" ? ["A", "B", "C"] : ["General"]
}

/** Shifts the given units run, in display order. */
export function shiftsOf(floors: readonly ProductionFloorCode[]) {
  const used = new Set(floors.flatMap(unitShifts))
  return dashboardShifts.filter((shift) => used.has(shift))
}

export function shiftLabel(shift: string) {
  return shift === "General" ? "General shift" : `Shift ${shift}`
}

export function unitLabel(unit: DashboardUnit) {
  return unit === "all"
    ? "All units"
    : productionFloors.find(({ code }) => code === unit)!.shortLabel
}

/** Production date and shift an instant belongs to; non-CNC units count the whole calendar day. */
export function unitShiftAt(floor: ProductionFloorCode, at: Date) {
  if (floor === "cnc") return productionShiftAt("cnc", at)
  return { productionDate: istDateValue(at), shift: "General" as const }
}

/** Start and end of one shift, as epoch milliseconds. */
export function shiftWindow(
  floor: ProductionFloorCode,
  productionDate: string,
  shift: string
): [number, number] {
  const end = productionShiftEndInstant({
    productionDate,
    productionFloorCode: floor,
    shift,
  }).getTime()
  return [end - (floor === "cnc" ? 8 : 11.5) * hourMs, end]
}

function dates(from: string, to: string) {
  const days: string[] = []
  for (
    let day = Date.parse(`${from}T00:00:00Z`);
    day <= Date.parse(`${to}T00:00:00Z`);
    day += 24 * hourMs
  ) {
    days.push(new Date(day).toISOString().slice(0, 10))
  }
  return days
}

/** Every selected shift window of a unit between two production dates. */
export function shiftWindows(
  floor: ProductionFloorCode,
  filters: { from: string; to: string; shift: "all" | DashboardShift }
) {
  const shifts = unitShifts(floor).filter(
    (shift) => filters.shift === "all" || filters.shift === shift
  )
  return dates(filters.from, filters.to).flatMap((date) =>
    shifts.map((shift) => shiftWindow(floor, date, shift))
  )
}
