import { machineFamilyMatches, machineMasterFamily } from "@workspace/db/planning-rules"
import {
  validDate,
  type PlanningContext,
  type PlanningLine,
  type ProposedLine,
} from "./order-acceptance"

export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const rows = (value: unknown) => (Array.isArray(value) ? value.map(record) : [])
const text = (value: unknown) => (value == null ? "" : String(value).trim())
const same = (a: unknown, b: unknown) =>
  text(a).toUpperCase() === text(b).toUpperCase()
function date(value: unknown) {
  const raw = text(value)
  if (validDate(raw.slice(0, 10))) return raw.slice(0, 10)
  // Canonical dashboard dates use day-month-name-year, never locale-ambiguous slash dates.
  const match = raw.match(/^(\d{1,2})[- ]+([A-Za-z]+)[- ]+(\d{2}|\d{4})$/)
  if (!match) return ""
  const month =
    [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(match[2]!.slice(0, 3).toLowerCase()) + 1
  const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]
  const result = `${year}-${String(month).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`
  return validDate(result) ? result : ""
}

export function proposalContext(snapshot: unknown, planningStart?: string) {
  const root = record(snapshot)
  const source = record(root.productionControl)
  const routes = rows(source.routeMasterRows)
  const cycles = rows(source.cycleMasterRows)
  const families = [
    ...new Set(routes.map((row) => text(row.machineFamily)).filter(Boolean)),
  ]
  const machines = rows(source.machinePlanningRows)
    .filter(
      (row) =>
        !row.status ||
        ["active", "yes", "true", "running", "available"].includes(
          text(row.status).toLowerCase()
        )
    )
    .map((row) => {
      const id = text(
        row.machine ??
          row.machineNo ??
          row["MACHINE NO"] ??
          row["M/C NO"] ??
          row["MACHINE NO."]
      )
      const matches = families.filter((family) =>
        machineFamilyMatches(family, machineMasterFamily(row))
      )
      return { id, family: matches.length === 1 ? matches[0]! : "" }
    })
    .filter((machine) => machine.id && machine.family)
  const context: PlanningContext = {
    version: Number(root.readModelVersion),
    machines,
    holidays: rows(source.planningHolidayRows)
      .map((row) => date(row.date ?? row.holidayDate))
      .filter(Boolean),
    weeklyHoliday: 5,
    existing: [],
    reservations: [],
    blockers: [],
  }
  if (!machines.length)
    context.blockers.push(
      "No unambiguous active machine families are available for this unit."
    )
  if (
    Object.values(record(root.sourceCoverage)).some(
      (value) => record(value).truncated === true
    )
  )
    context.blockers.push(
      "Production snapshot is truncated; complete workload data is required before proposal approval."
    )
  const details = rows(source.machinePlanDetailRows)
  function resolve(line: ProposedLine): PlanningLine {
    const productRoutes = routes.filter((route) =>
      same(route.partNo, line.part)
    )
    const options = [
      ...new Set(productRoutes.map((route) => text(route.optionNumber))),
    ]
    const option = line.option || (options.length === 1 ? options[0]! : "")
    const selected = productRoutes
      .filter((route) => same(route.optionNumber, option))
      .sort((a, b) => Number(a.setupNo) - Number(b.setupNo))
    let issue = !selected.length
      ? options.length > 1
        ? "Select a route option"
        : "Missing product route"
      : ""
    const operations = selected.map((route) => {
      const matches = cycles.filter(
        (cycle) =>
          same(cycle.partNo, line.part) &&
          same(cycle.optionNumber, option) &&
          same(cycle.setupNo, route.setupNo)
      )
      const seconds = Number(matches[0]?.totalTime)
      const family = text(route.machineFamily)
      if (matches.length !== 1 || !Number.isFinite(seconds) || seconds <= 0)
        issue = `Missing or ambiguous cycle time: setup ${text(route.setupNo)}`
      if (!machines.some((machine) => machine.family === family))
        issue = `No active machines: ${family}`
      return {
        family,
        setup: text(route.setupNo),
        hours: Number.isFinite(seconds) ? (seconds * line.quantity) / 3600 : 0,
      }
    })
    return { ...line, option, issue, operations }
  }
  for (const work of rows(source.workOrders)) {
    if (text(work.dispatchStatus) === "Shifted to dispatch") continue
    const quantity = Number(work.orderPcs)
    if (!(quantity > 0) || Number(work.finalSetupGoodPieces) >= quantity)
      continue
    const id = text(work.jcNo)
    const own = details.filter(
      (row) => same(row.jcNo, id) && same(row.partCode, work.partCode)
    )
    const line = resolve({
      id,
      part: text(work.partCode),
      option: text(work.optionNumber),
      quantity,
      rmDate:
        work.rmStatus === "Received"
          ? date(work.rmInwardDate) || "1970-01-01"
          : "",
    })
    if (!id)
      context.blockers.push("An existing work order has no job-card reference.")
    if (work.rmStatus === "Received") {
      if (!own.length)
        line.issue =
          "Existing received work has no canonical machine schedule; recalculate the production plan."
      for (const row of own) {
        if (
          text(row.runningStatus) === "Complete" ||
          Number(row.rawActualQty) >= Number(row.orderPcs)
        )
          continue
        const machine = text(row.machine)
        const start = date(row.plannedStartDate)
        const end = date(
          row.plannedProductionEndDate ?? row.plannedCompletionDate
        )
        if (!start || !end || !machines.some((item) => item.id === machine))
          line.issue = "Existing machine assignment or dates are incomplete."
        else if (planningStart && end < planningStart)
          line.issue =
            "Unfinished existing work has past completion dates; refresh its production plan."
        else context.reservations.push({ machine, start, end })
      }
      line.operations = [] // Existing canonical assignments are reserved, never scheduled twice.
    } else if (
      Number(work.rawRows) > 0 ||
      rows(work.routeChangeRemainingSetups).length
    ) {
      line.issue =
        "Waiting-RM work has production or route changes; resolve its remaining-work plan first."
    }
    context.existing.push(line)
  }
  for (const constraint of rows(source.machineConstraints)) {
    if (
      ["cancelled", "resolved", "inactive"].includes(
        text(constraint.status).toLowerCase()
      )
    )
      continue
    const machine = text(constraint.machine ?? constraint.machineNumber)
    const start = date(
      constraint.unavailableFrom ?? constraint.startDate ?? constraint.fromDate
    )
    const end = date(
      constraint.unavailableTo ?? constraint.endDate ?? constraint.toDate
    )
    if (!machine || !start || !end)
      context.blockers.push(
        "An active machine constraint needs confirmed start/end dates."
      )
    else context.reservations.push({ machine, start, end })
  }
  return { context, resolve }
}
