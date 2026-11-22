import "server-only"

import {
  createProductionShopFloorRepository,
  createShiftIdleOperatorRepository,
  repositoryPool,
} from "@workspace/db"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { productionShiftAt } from "@workspace/db/production-session-domain"
import { productionBreakIntervals } from "@workspace/db/production-breaks"
import { isIsoCalendarDate } from "@workspace/ui/lib/calendar-date"

import { readAuthEnvironment } from "./auth/auth"
import {
  type CncDashboardCardId,
  type CncDashboardData,
  type CncDashboardFilters,
} from "./cnc-dashboard"
import { formatIstDateTime, istDateValue } from "./date-time"
import {
  shiftLabel,
  shiftsOf,
  shiftWindow,
  shiftWindows,
  unitShifts,
} from "./dashboard-units"

/** Units the selected unit filter covers. */
export function selectedUnits(
  filters: Pick<CncDashboardFilters, "unit">,
  units: readonly ProductionFloorCode[]
) {
  return filters.unit === "all" ? units : units.filter((unit) => unit === filters.unit)
}

export function cncDashboardFilters(
  query: Record<string, string | string[] | undefined>,
  units: readonly ProductionFloorCode[]
): CncDashboardFilters {
  const now = new Date()
  const today = istDateValue(now)
  const unit =
    query.unit === "all" && units.length > 1
      ? "all"
      : (units.find((value) => value === query.unit) ??
        (units.includes("cnc") ? "cnc" : (units[0] ?? "cnc")))
  const productionDay =
    unit === "cnc" || unit === "all"
      ? (productionShiftAt("cnc", now)?.productionDate ?? today)
      : today
  const from =
    typeof query.from === "string" && isIsoCalendarDate(query.from)
      ? query.from
      : productionDay
  const to =
    typeof query.to === "string" && isIsoCalendarDate(query.to)
      ? query.to
      : from
  const shift =
    shiftsOf(selectedUnits({ unit }, units)).find(
      (value) => value === query.shift
    ) ?? "all"
  if (
    query.applyMonth === "1" &&
    typeof query.month === "string" &&
    isIsoCalendarDate(`${query.month}-01`)
  ) {
    const [year, month] = query.month.split("-").map(Number)
    const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
    return {
      from: `${query.month}-01`,
      to: `${query.month}-${lastDay}`,
      shift,
      unit,
    }
  }
  return { from, to, shift, unit }
}

function recordedEvents(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (event): event is Record<string, unknown> =>
          typeof event === "object" && event !== null
      )
    : []
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function addToGroup(
  groups: Map<string, number>,
  label: unknown,
  value: number
) {
  if (value <= 0) return
  const key = typeof label === "string" && label ? label : "Unclassified"
  groups.set(key, (groups.get(key) ?? 0) + value)
}

function topRows(groups: Map<string, number>, limit = 8) {
  return [...groups]
    .sort(([a, first], [b, second]) => second - first || a.localeCompare(b))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}

const hourMs = 3_600_000

/** Elapsed hours of the selected shifts of one unit, up to now. */
function elapsedShiftHours(
  floor: ProductionFloorCode,
  filters: CncDashboardFilters,
  now: number
) {
  return (
    shiftWindows(floor, filters).reduce(
      (total, [start, end]) => total + Math.max(0, Math.min(end, now) - start),
      0
    ) / hourMs
  )
}

function coveredHours(intervals: [number, number][]) {
  let end = 0
  let covered = 0
  for (const [start, finish] of intervals.sort((a, b) => a[0] - b[0])) {
    covered += Math.max(0, finish - Math.max(end, start))
    end = Math.max(end, finish)
  }
  return covered / hourMs
}

export async function loadCncSessionDashboard(
  filters: CncDashboardFilters,
  cards: readonly CncDashboardCardId[],
  floors: readonly ProductionFloorCode[]
): Promise<CncDashboardData> {
  const { from, shift, to } = filters
  const options = { connectionString: readAuthEnvironment().connectionString }
  const repository = createProductionShopFloorRepository(options)
  const { pool, close } = repositoryPool(options)
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const categoryMachines =
      cards.includes("cnc-category-efficiency") ||
      cards.includes("cnc-shift-attendance")
        ? await pool.query<{
            machine: string
            category: string | null
            type: string | null
          }>(
            `SELECT machine.machine_number AS machine,
            NULLIF(btrim(machine.source_payload->>'machineFamily'), '') AS category,
            NULLIF(btrim(machine.source_payload->>'machineType'), '') AS type
           FROM catalog.machines machine
           JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
           WHERE machine.organization_id = $1 AND floor.code = ANY($2::text[])`,
            [organizationId, floors]
          )
        : null
    const categoryByMachine = new Map(
      (categoryMachines?.rows ?? []).map(({ machine, category }) => [
        machine,
        category?.toUpperCase() ?? "Unclassified",
      ])
    )
    const typeByMachine = new Map(
      (categoryMachines?.rows ?? []).map(({ machine, type }) => [
        machine,
        type ?? "Unclassified",
      ])
    )
    // Per shift: distinct operators and machines, keyed by date so ranges sum.
    const attendance = new Map<
      string,
      { operators: Set<string>; machines: Map<string, Set<string>> }
    >()
    const categories = new Map<
      string,
      {
        machines: Set<string>
        output: number
        rejected: number
        earned: number
        measured: number
        sessions: number
      }
    >()
    const showFleet =
      cards.includes("cnc-machine-availability") ||
      cards.includes("cnc-fleet-hours") ||
      cards.includes("cnc-machine-activity") ||
      cards.includes("cnc-machine-hours-detail")
    const showTimeBreakdown =
      cards.includes("cnc-fleet-hours") ||
      cards.includes("cnc-machine-hours-detail")
    const breakSchedules = showTimeBreakdown
      ? await Promise.all(
          floors.map(async (floor) => ({
            floor,
            schedule: await repository.readProductionBreakSchedule({
              organizationId,
              productionFloorCode: floor,
            }),
          }))
        )
      : []
    const active = showFleet
      ? await pool.query<{ machine: string; floor: ProductionFloorCode }>(
          `
      SELECT machine.machine_number AS machine, floor.code AS floor
      FROM catalog.machines machine
      JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
      WHERE machine.organization_id = $1 AND machine.active AND floor.code = ANY($2::text[])
      ORDER BY machine.machine_number
    `,
          [organizationId, floors]
        )
      : null
    const coverage = new Map(
      (active?.rows ?? []).map(({ machine, floor }) => [
        machine,
        {
          floor,
          sessions: 0,
          open: false,
          stopped: false,
          intervals: [] as [number, number][],
          stops: [] as [number, number][],
        },
      ])
    )
    const now = Date.now()
    const downtimeLog: (string | number)[][] = []
    const machinistStops: (string | number)[][] = []
    let machinistMinutes = 0
    const rejectionLog: (string | number)[][] = []
    let sessionCount = 0
    let produced = 0
    let good = 0
    let rejected = 0
    let downtime = 0
    let open = 0
    let allSessionCount = 0
    let runtime = 0
    let breaks = 0
    let earnedSeconds = 0
    let measuredSeconds = 0
    const operators = new Map<
      string,
      {
        name: string
        output: number
        rejected: number
        downtime: number
        earned: number
        measured: number
        machines: Set<string>
        shifts: Set<string>
      }
    >()
    const shifts = new Map<string, number>()
    const shiftTotals = new Map<
      string,
      { pieces: number; rejected: number; downtime: number; sessions: number }
    >()
    const capacityByShift = new Map<
      string,
      { capacity: number; actual: number; eligible: number }
    >()
    const capacityByMachine = new Map<string, number>()
    const machines = new Map<
      string,
      Omit<CncDashboardData["machines"][number], "jobs"> & { jobs: Set<string> }
    >()
    const downtimeReasons = new Map<string, number>()
    const rejectionReasons = new Map<string, number>()
    const rejectionCauses = new Map<string, number>()
    const limit = 500

    for (const floor of floors)
    for (let offset = 0; ; offset += limit) {
      const { rows } = await repository.readProductionSessions({
        endDate: to,
        limit,
        offset,
        organizationId,
        productionFloorCode: floor,
        startDate: from,
      })
      allSessionCount += rows.length
      for (const row of rows) {
        const output = number(row.totalPieces)
        addToGroup(shifts, row.shift, output)
        const rowShift = String(row.shift)
        const totalsByShift = shiftTotals.get(rowShift) ?? {
          pieces: 0,
          rejected: 0,
          downtime: 0,
          sessions: 0,
        }
        totalsByShift.pieces += output
        totalsByShift.rejected += number(row.rejectedPieces)
        totalsByShift.downtime += number(row.downtimeMinutes)
        totalsByShift.sessions++
        shiftTotals.set(rowShift, totalsByShift)
        const present = attendance.get(rowShift) ?? {
          operators: new Set<string>(),
          machines: new Map<string, Set<string>>(),
        }
        const day = String(row.productionDate)
        if (row.operatorCode ?? row.operatorName)
          present.operators.add(
            `${day}|${String(row.operatorCode ?? row.operatorName)}`
          )
        if (typeof row.machineNumber === "string") {
          const type = typeByMachine.get(row.machineNumber) ?? "Unclassified"
          const running = present.machines.get(type) ?? new Set<string>()
          running.add(`${day}|${row.machineNumber}`)
          present.machines.set(type, running)
        }
        attendance.set(rowShift, present)
        if (shift !== "all" && shift !== row.shift) continue
        sessionCount++
        produced += output
        good += number(row.goodPieces)
        rejected += number(row.rejectedPieces)
        downtime += number(row.downtimeMinutes)
        runtime += number(row.runtimeMinutes)
        breaks += number(row.breakMinutes)
        const operator = String(
          row.operatorCode ?? row.operatorName ?? "Unrecorded"
        )
        const totals = operators.get(operator) ?? {
          name: String(row.operatorName ?? "").trim(),
          output: 0,
          rejected: 0,
          downtime: 0,
          earned: 0,
          measured: 0,
          machines: new Set<string>(),
          shifts: new Set<string>(),
        }
        totals.output += output
        totals.rejected += number(row.rejectedPieces)
        totals.downtime += number(row.downtimeMinutes)
        totals.shifts.add(rowShift)
        const cycleSeconds = number(row.cycleTimeSeconds)
        const netSeconds = number(row.runtimeMinutes) * 60
        const machine =
          typeof row.machineNumber === "string"
            ? row.machineNumber
            : "Unclassified"
        const category = categoryByMachine.get(machine) ?? "Unclassified"
        const categoryTotals = categories.get(category) ?? {
          machines: new Set<string>(),
          output: 0,
          rejected: 0,
          earned: 0,
          measured: 0,
          sessions: 0,
        }
        categoryTotals.machines.add(machine)
        categoryTotals.output += output
        categoryTotals.rejected += number(row.rejectedPieces)
        if (
          row.status === "closed" &&
          !row.outputPending &&
          row.cycleBasis !== "weight_batch" &&
          cycleSeconds > 0 &&
          netSeconds > 0
        ) {
          const earned = output * cycleSeconds
          earnedSeconds += earned
          measuredSeconds += netSeconds
          totals.earned += earned
          totals.measured += netSeconds
          categoryTotals.earned += earned
          categoryTotals.measured += netSeconds
          categoryTotals.sessions++
        }
        categories.set(category, categoryTotals)
        operators.set(operator, totals)
        if (row.status === "open") open++
        totals.machines.add(machine)
        const shiftKey = String(row.shift)
        const shiftCapacity = capacityByShift.get(shiftKey) ?? {
          capacity: 0,
          actual: 0,
          eligible: 0,
        }
        shiftCapacity.actual += output
        // An open session's capacity stops at its shift end, so a session
        // left open does not keep accruing capacity until it is closed.
        const allocated = Math.max(
          0,
          row.status === "open" && row.targetRuntimeMinutes != null
            ? Math.min(
                number(row.runtimeMinutes),
                number(row.targetRuntimeMinutes)
              )
            : number(row.runtimeMinutes)
        )
        if (cycleSeconds > 0 && row.cycleBasis !== "weight_batch") {
          const capacity = Math.floor((allocated * 60) / cycleSeconds)
          shiftCapacity.capacity += capacity
          shiftCapacity.eligible++
          capacityByMachine.set(
            machine,
            (capacityByMachine.get(machine) ?? 0) + capacity
          )
        }
        capacityByShift.set(shiftKey, shiftCapacity)
        const evidence = coverage.get(machine)
        if (evidence) {
          evidence.sessions++
          evidence.open ||= row.status === "open"
          evidence.stopped ||= row.hasOpenDowntime === true
          if (
            typeof row.productionDate === "string" &&
            unitShifts(floor).some((key) => key === row.shift)
          ) {
            const [shiftStart, end] = shiftWindow(
              floor,
              row.productionDate,
              String(row.shift)
            )
            const start = Math.max(
              shiftStart,
              new Date(String(row.startedAt)).getTime()
            )
            const stop = Math.min(
              end,
              now,
              row.endedAt ? new Date(String(row.endedAt)).getTime() : now
            )
            if (start < stop) evidence.intervals.push([start, stop])
          }
        }
        const machineTotals = machines.get(machine) ?? {
          machine,
          jobs: new Set<string>(),
          produced: 0,
          rejected: 0,
          downtime: 0,
        }
        if (typeof row.jobCardNumber === "string" && row.jobCardNumber) {
          machineTotals.jobs.add(row.jobCardNumber)
        }
        machineTotals.produced += output
        machineTotals.rejected += number(row.rejectedPieces)
        machineTotals.downtime += number(row.downtimeMinutes)
        machines.set(machine, machineTotals)
        for (const event of recordedEvents(row.downtimeEvents)) {
          addToGroup(
            downtimeReasons,
            event.reasonName,
            number(event.durationMinutes)
          )
          if (
            showTimeBreakdown &&
            evidence &&
            typeof row.productionDate === "string" &&
            unitShifts(floor).some((key) => key === row.shift)
          ) {
            const [shiftStart, end] = shiftWindow(
              floor,
              row.productionDate,
              String(row.shift)
            )
            const start = Math.max(
              shiftStart,
              Date.parse(String(event.startedAt))
            )
            const stop = Math.min(
              end,
              now,
              event.endedAt ? Date.parse(String(event.endedAt)) : now
            )
            if (start < stop) evidence.stops.push([start, stop])
          }
          if (
            event.enteredRole === "machinist" ||
            event.enteredRole === "assistant_machinist"
          ) {
            machinistMinutes += number(event.durationMinutes)
            if (cards.includes("cnc-machinist-downtime-log")) {
              machinistStops.push([
                machine,
                String(row.shift ?? "—"),
                String(event.reasonName ?? "Unclassified"),
                formatIstDateTime(String(event.startedAt ?? "")),
                event.durationMinutes == null
                  ? "—"
                  : number(event.durationMinutes),
              ])
            }
          }
          if (cards.includes("cnc-downtime-log")) {
            downtimeLog.push([
              machine,
              String(row.shift ?? "—"),
              String(event.reasonName ?? "Unclassified"),
              formatIstDateTime(String(event.startedAt ?? "")),
              event.endedAt ? formatIstDateTime(String(event.endedAt)) : "Open",
              event.durationMinutes == null
                ? "—"
                : number(event.durationMinutes),
            ])
          }
        }
        for (const event of recordedEvents(row.rejectionEvents)) {
          addToGroup(rejectionReasons, event.reasonName, number(event.quantity))
          addToGroup(rejectionCauses, event.remarkName, number(event.quantity))
          if (cards.includes("cnc-rejection-log")) {
            rejectionLog.push([
              `${machine} · ${row.jobCardNumber ?? "—"}`,
              `${row.partCode ?? "—"} / ${row.setupNumber ?? "—"} / ${row.shift ?? "—"}`,
              String(event.reasonName ?? "Unclassified"),
              String(event.remarkName ?? "Unclassified"),
              String(event.typeName ?? "Unclassified"),
              number(event.quantity),
            ])
          }
        }
      }
      if (rows.length < limit) break
    }

    // Elapsed hours and configured breaks differ per unit's shift pattern.
    const hoursByFloor = new Map(
      floors.map((floor) => [floor, elapsedShiftHours(floor, filters, now)])
    )
    const breaksByFloor = new Map(
      breakSchedules.map(({ floor, schedule }) => [
        floor,
        shiftWindows(floor, filters).flatMap(([start, end]) =>
          start < now
            ? productionBreakIntervals(schedule.breaks, {
                startedAt: new Date(start),
                endedAt: new Date(Math.min(end, now)),
              }).map(
                ({ startedAt, endedAt }): [number, number] => [
                  startedAt.getTime(),
                  endedAt.getTime(),
                ]
              )
            : []
        ),
      ])
    )
    const fleetRows = [...coverage].map(([machine, evidence]) => ({
      machine,
      ...evidence,
      hours: coveredHours(evidence.intervals),
      elapsed: hoursByFloor.get(evidence.floor) ?? 0,
      breaks: breaksByFloor.get(evidence.floor) ?? [],
    }))
    const fleetHours = fleetRows.reduce((sum, row) => sum + row.elapsed, 0)
    const timeRows = fleetRows.map(
      ({ machine, intervals, stops, elapsed, breaks }) => {
        const breakHours = coveredHours([...breaks])
        const eventsAndBreaks = coveredHours([...breaks, ...stops])
        const accounted = coveredHours([...breaks, ...stops, ...intervals])
        return {
          machine,
          elapsed,
          breakHours,
          runtime: accounted - eventsAndBreaks,
          downtime: eventsAndBreaks - breakHours,
          missing: Math.max(0, elapsed - accounted),
        }
      }
    )
    const roundHours = (value: number) => Math.round(value * 100) / 100
    // Operators the shop floor marked present without a machine.
    const idleOperators = cards.includes("cnc-shift-attendance")
      ? await createShiftIdleOperatorRepository({ pool }).readBetween(
          organizationId,
          floors,
          from,
          to
        )
      : []
    const idleByShift = new Map<string, number>()
    for (const idle of idleOperators) {
      const present = attendance.get(idle.shift) ?? {
        operators: new Set<string>(),
        machines: new Map<string, Set<string>>(),
      }
      const key = `${idle.productionDate}|${idle.code}`
      if (present.operators.has(key)) continue
      present.operators.add(key)
      attendance.set(idle.shift, present)
      idleByShift.set(idle.shift, (idleByShift.get(idle.shift) ?? 0) + 1)
    }
    const unitShiftList = shiftsOf(floors)
    const attendanceShifts = unitShiftList.filter(
      (key) => shift === "all" || shift === key
    )
    const machineTypes = [
      ...new Set(
        attendanceShifts.flatMap((key) => [
          ...(attendance.get(key)?.machines.keys() ?? []),
        ])
      ),
    ].sort((left, right) =>
      left.localeCompare(right, "en-IN", { numeric: true })
    )
    return {
      sessionCount,
      values: {
        "cnc-pieces-produced": produced,
        "cnc-sessions-started": sessionCount,
        "cnc-machines-reporting": [...machines.values()].filter(
          (row) => row.produced > 0
        ).length,
        "cnc-good-pieces": good,
        "cnc-pieces-rejected": rejected,
        "cnc-logged-downtime": downtime,
        "cnc-open-sessions": open,
        "cnc-rejection-rate": produced
          ? Math.round((rejected / produced) * 10000) / 100
          : null,
        "cnc-operator-efficiency": measuredSeconds
          ? Math.round((earnedSeconds / measuredSeconds) * 1000) / 10
          : null,
        "cnc-floor-operators": [...operators.keys()].filter(
          (key) => key && key !== "Unrecorded"
        ).length,
        "cnc-floor-efficiency": measuredSeconds
          ? Math.round((earnedSeconds / measuredSeconds) * 1000) / 10
          : null,
        "cnc-machinist-downtime": machinistMinutes,
      },
      charts: {
        "cnc-category-efficiency": [...categories]
          .sort(([left], [right]) =>
            left.localeCompare(right, "en-IN", { numeric: true })
          )
          .flatMap(([label, totals]) =>
            totals.measured
              ? [
                  {
                    label,
                    value: Number(
                      ((totals.earned / totals.measured) * 100).toFixed(1)
                    ),
                  },
                ]
              : []
          ),
        "cnc-production-capacity": [...capacityByShift]
          .sort(([a], [b]) => a.localeCompare(b))
          .flatMap(([key, { capacity, actual, eligible }]) => [
            { label: `${shiftLabel(key)} · Actual`, value: actual },
            ...(eligible
              ? [
                  {
                    label: `${shiftLabel(key)} · Session capacity`,
                    value: capacity,
                  },
                ]
              : []),
          ]),
        "cnc-shift-comparison": allSessionCount
          ? unitShiftList.map((key) => ({
              label: shiftLabel(key),
              value: shifts.get(key) ?? 0,
            }))
          : [],
        "cnc-downtime-reasons": topRows(downtimeReasons),
        "cnc-rejection-reasons": topRows(
          rejectionReasons,
          rejectionReasons.size
        ),
        "cnc-rejection-causes": topRows(rejectionCauses, rejectionCauses.size),
        "cnc-machine-hours": sessionCount
          ? [
              { label: "Runtime", value: Math.round(runtime / 6) / 10 },
              { label: "Logged stops", value: Math.round(downtime / 6) / 10 },
              { label: "Breaks", value: Math.round(breaks / 6) / 10 },
            ]
          : [],
        "cnc-fleet-hours": fleetRows.length
          ? [
              {
                label: "Total fleet hours",
                value: roundHours(fleetHours),
              },
              {
                label: "Session time excluding stops",
                value: roundHours(
                  timeRows.reduce((sum, row) => sum + row.runtime, 0)
                ),
              },
              {
                label: "Recorded downtime",
                value: roundHours(
                  timeRows.reduce((sum, row) => sum + row.downtime, 0)
                ),
              },
              {
                label: "No session recorded",
                value: roundHours(
                  timeRows.reduce((sum, row) => sum + row.missing, 0)
                ),
              },
              {
                label: "Planned breaks",
                value: roundHours(
                  timeRows.reduce((sum, row) => sum + row.breakHours, 0)
                ),
              },
            ]
          : [],
      },
      tables: {
        "cnc-category-efficiency": {
          columns: [
            "Machine category",
            "Machines reporting",
            "Produced",
            "Rejected",
            "Measured sessions",
            "Net working time (h)",
            "Standard time earned (h)",
            "Efficiency",
          ],
          rows: [...categories]
            .sort(([left], [right]) =>
              left.localeCompare(right, "en-IN", { numeric: true })
            )
            .map(([category, totals]) => [
              category,
              totals.machines.size,
              totals.output,
              totals.rejected,
              totals.sessions,
              totals.measured ? roundHours(totals.measured / 3600) : "—",
              totals.measured ? roundHours(totals.earned / 3600) : "—",
              totals.measured
                ? `${((totals.earned / totals.measured) * 100).toFixed(1)}%`
                : "—",
            ]),
        },
        "cnc-shift-attendance": {
          columns: [
            "Shift",
            "Operators present",
            "Without machine",
            "Machines running",
            ...machineTypes,
          ],
          rows: attendanceShifts.map((key) => {
            const present = attendance.get(key)
            const running = machineTypes.map(
              (type) => present?.machines.get(type)?.size ?? 0
            )
            return [
              shiftLabel(key),
              present?.operators.size ?? 0,
              idleByShift.get(key) ?? 0,
              running.reduce((sum, count) => sum + count, 0),
              ...running,
            ]
          }),
        },
        "cnc-shift-detail": {
          columns: [
            "Shift",
            "Pieces",
            "Rejected",
            "Downtime (min)",
            "Sessions",
          ],
          rows: unitShiftList.map((key) => {
            const row = shiftTotals.get(key)
            return [
              shiftLabel(key),
              row?.pieces ?? 0,
              row?.rejected ?? 0,
              row?.downtime ?? 0,
              row?.sessions ?? 0,
            ]
          }),
        },
        "cnc-machine-hours-detail": {
          columns: [
            "Machine",
            "Elapsed hours",
            "Session hrs",
            "Downtime hrs",
            "No session hrs",
            "Break hrs",
          ],
          rows: timeRows.map(
            ({ machine, elapsed, runtime, downtime, missing, breakHours }) => [
              machine,
              roundHours(elapsed),
              roundHours(runtime),
              roundHours(downtime),
              roundHours(missing),
              roundHours(breakHours),
            ]
          ),
        },
        "cnc-machine-activity": {
          columns: [
            "Machine",
            "Recorded output",
            "Session evidence",
            "Downtime (min)",
          ],
          rows: fleetRows.map(({ machine, sessions }) => [
            machine,
            machines.get(machine)?.produced ?? 0,
            (machines.get(machine)?.produced ?? 0) > 0
              ? "Ran in shift"
              : sessions
                ? "Session without output"
                : "No shift record",
            machines.get(machine)?.downtime ?? 0,
          ]),
        },
        "cnc-machine-capacity": {
          columns: [
            "Machine",
            "Actual pieces",
            "Session capacity",
            "Recorded downtime (min)",
          ],
          rows: [...machines.values()].map(
            ({ machine, produced, downtime }) => [
              machine,
              produced,
              capacityByMachine.get(machine) ?? "—",
              downtime,
            ]
          ),
        },
        "cnc-machinist-downtime-log": {
          columns: ["Machine", "Shift", "Reason", "Started at", "Minutes"],
          rows: machinistStops,
        },
        "cnc-floor-operator-detail": {
          columns: [
            "Operator / ID",
            "Shift / machines",
            "Produced / rejected",
            "Net working time / logged stops",
            "Standard time earned",
            "Efficiency",
          ],
          rows: [...operators]
            .filter(([id]) => id && id !== "Unrecorded")
            .sort(([a, left], [b, right]) =>
              (left.name || a).localeCompare(right.name || b)
            )
            .map(([id, totals]) => [
              totals.name && totals.name !== id ? `${totals.name} · ${id}` : id,
              `${[...totals.shifts]
                .sort()
                .map(shiftLabel)
                .join(", ")} · ${[...totals.machines].join(", ")}`,
              `${totals.output} / ${totals.rejected}`,
              `${totals.measured ? `${roundHours(totals.measured / 3600)} h` : "—"} / ${roundHours(totals.downtime)} min`,
              totals.measured ? `${roundHours(totals.earned / 3600)} h` : "—",
              totals.measured
                ? `${Math.round((totals.earned / totals.measured) * 1000) / 10}%`
                : "—",
            ]),
        },
        "cnc-machine-availability": {
          columns: ["Machine", "Session evidence", "Sessions", "Hours covered"],
          rows: fleetRows.map(({ machine, stopped, open, sessions, hours }) => [
            machine,
            stopped
              ? "Open downtime"
              : open
                ? "Open session"
                : sessions
                  ? "Recorded sessions"
                  : "No session recorded",
            sessions,
            Math.round(hours * 10) / 10,
          ]),
        },
        "cnc-downtime-log": {
          columns: [
            "Machine",
            "Shift",
            "Reason",
            "Started at",
            "Ended at",
            "Minutes",
          ],
          rows: downtimeLog,
        },
        "cnc-rejection-log": {
          columns: [
            "Machine / job",
            "Part / setup / shift",
            "Defect",
            "Cause",
            "Stage",
            "Pieces",
          ],
          rows: rejectionLog,
        },
        "cnc-operator-output": {
          columns: ["Operator", "Pieces", "Measured hours", "Efficiency"],
          rows: [...operators]
            .sort((a, b) => b[1].output - a[1].output)
            .map(([name, totals]) => [
              name,
              totals.output,
              Math.round(totals.measured / 360) / 10,
              totals.measured
                ? `${Math.round((totals.earned / totals.measured) * 1000) / 10}%`
                : "—",
            ]),
        },
      },
      machines: [...machines.values()]
        .sort((left, right) =>
          left.machine.localeCompare(right.machine, "en-IN", { numeric: true })
        )
        .map(({ jobs, ...machine }) => ({ ...machine, jobs: [...jobs] })),
    }
  } finally {
    await Promise.all([repository.close(), close()])
  }
}
