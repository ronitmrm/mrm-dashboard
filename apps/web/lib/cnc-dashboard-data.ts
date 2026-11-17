import "server-only"

import {
  createProductionShopFloorRepository,
  repositoryPool,
} from "@workspace/db"
import {
  productionShiftAt,
  productionShiftEndInstant,
} from "@workspace/db/production-session-domain"
import { productionBreakIntervals } from "@workspace/db/production-breaks"
import { isIsoCalendarDate } from "@workspace/ui/lib/calendar-date"

import { readAuthEnvironment } from "./auth/auth"
import {
  cncShifts,
  type CncDashboardCardId,
  type CncDashboardData,
  type CncDashboardFilters,
} from "./cnc-dashboard"
import { formatIstDateTime, istDateValue } from "./date-time"

export function cncDashboardFilters(
  query: Record<string, string | string[] | undefined>
): CncDashboardFilters {
  const now = new Date()
  const today = istDateValue(now)
  const productionDay = productionShiftAt("cnc", now)?.productionDate ?? today
  const from =
    typeof query.from === "string" && isIsoCalendarDate(query.from)
      ? query.from
      : productionDay
  const to =
    typeof query.to === "string" && isIsoCalendarDate(query.to)
      ? query.to
      : from
  const shift = cncShifts.find((value) => value === query.shift) ?? "all"
  if (
    query.applyMonth === "1" &&
    typeof query.month === "string" &&
    isIsoCalendarDate(`${query.month}-01`)
  ) {
    const [year, month] = query.month.split("-").map(Number)
    const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
    return { from: `${query.month}-01`, to: `${query.month}-${lastDay}`, shift }
  }
  return { from, to, shift }
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

function shiftEnd(date: string, shift: string) {
  return productionShiftEndInstant({
    productionDate: date,
    productionFloorCode: "cnc",
    shift,
  }).getTime()
}

function elapsedShiftHours(filters: CncDashboardFilters, now: number) {
  if (filters.shift === "all") {
    return (
      Math.max(
        0,
        Math.min(now, shiftEnd(filters.to, "C")) -
          (shiftEnd(filters.from, "A") - 8 * hourMs)
      ) / hourMs
    )
  }
  const firstEnd = shiftEnd(filters.from, filters.shift)
  const dayMs = 24 * hourMs
  const count = 1 + (shiftEnd(filters.to, filters.shift) - firstEnd) / dayMs
  const fullShifts = Math.min(
    count,
    Math.max(0, Math.floor((now - firstEnd) / dayMs) + 1)
  )
  return (
    fullShifts * 8 +
    (fullShifts === count
      ? 0
      : Math.max(
          0,
          Math.min(
            8,
            (now - (firstEnd + fullShifts * dayMs - 8 * hourMs)) / hourMs
          )
        ))
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
  cards: readonly CncDashboardCardId[]
): Promise<CncDashboardData> {
  const { from, shift, to } = filters
  const options = { connectionString: readAuthEnvironment().connectionString }
  const repository = createProductionShopFloorRepository(options)
  const { pool, close } = repositoryPool(options)
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const showFleet =
      cards.includes("cnc-machine-availability") ||
      cards.includes("cnc-fleet-hours") ||
      cards.includes("cnc-machine-activity") ||
      cards.includes("cnc-machine-hours-detail")
    const showTimeBreakdown =
      cards.includes("cnc-fleet-hours") ||
      cards.includes("cnc-machine-hours-detail")
    const breakSchedule = showTimeBreakdown
      ? await repository.readProductionBreakSchedule({
          organizationId,
          productionFloorCode: "cnc",
        })
      : null
    const active = showFleet
      ? await pool.query<{ machine: string }>(
          `
      SELECT machine.machine_number AS machine
      FROM catalog.machines machine
      JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
      WHERE machine.organization_id = $1 AND machine.active AND floor.code = 'cnc'
      ORDER BY machine.machine_number
    `,
          [organizationId]
        )
      : null
    const coverage = new Map(
      (active?.rows ?? []).map(({ machine }) => [
        machine,
        {
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

    for (let offset = 0; ; offset += limit) {
      const { rows } = await repository.readProductionSessions({
        endDate: to,
        limit,
        offset,
        organizationId,
        productionFloorCode: "cnc",
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
        }
        operators.set(operator, totals)
        if (row.status === "open") open++
        const machine =
          typeof row.machineNumber === "string"
            ? row.machineNumber
            : "Unclassified"
        totals.machines.add(machine)
        const shiftKey = String(row.shift)
        const shiftCapacity = capacityByShift.get(shiftKey) ?? {
          capacity: 0,
          actual: 0,
          eligible: 0,
        }
        shiftCapacity.actual += output
        const allocated = Math.max(
          0,
          number(row.elapsedMinutes) - number(row.breakMinutes)
        )
        if (
          cycleSeconds > 0 &&
          allocated > 0 &&
          row.cycleBasis !== "weight_batch"
        ) {
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
            cncShifts.some((key) => key === row.shift)
          ) {
            const end = shiftEnd(row.productionDate, String(row.shift))
            const start = Math.max(
              end - 8 * hourMs,
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
            cncShifts.some((key) => key === row.shift)
          ) {
            const end = shiftEnd(row.productionDate, String(row.shift))
            const start = Math.max(
              end - 8 * hourMs,
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

    const hoursPerMachine = elapsedShiftHours(filters, now)
    const scheduledBreaks: [number, number][] = []
    if (breakSchedule && hoursPerMachine > 0) {
      const firstShift = shift === "all" ? "A" : shift
      const start = shiftEnd(from, firstShift) - 8 * hourMs
      const lastShift = shift === "all" ? "C" : shift
      const end = Math.min(now, shiftEnd(to, lastShift))
      const breaks = productionBreakIntervals(breakSchedule.breaks, {
        startedAt: new Date(start),
        endedAt: new Date(end),
      })
      for (const item of breaks) {
        if (shift === "all") {
          scheduledBreaks.push([
            item.startedAt.getTime(),
            item.endedAt.getTime(),
          ])
          continue
        }
        const context = productionShiftAt("cnc", item.startedAt)
        const firstEnd = context ? shiftEnd(context.productionDate, shift) : end
        for (const shiftBoundary of [firstEnd, firstEnd + 24 * hourMs]) {
          const a = Math.max(
            start,
            shiftBoundary - 8 * hourMs,
            item.startedAt.getTime()
          )
          const b = Math.min(end, shiftBoundary, item.endedAt.getTime())
          if (a < b) scheduledBreaks.push([a, b])
        }
      }
    }
    const breakHours = coveredHours(scheduledBreaks)
    const fleetRows = [...coverage].map(([machine, evidence]) => ({
      machine,
      ...evidence,
      hours: coveredHours(evidence.intervals),
    }))
    const fleetHours = hoursPerMachine * fleetRows.length
    const timeRows = fleetRows.map(({ machine, intervals, stops }) => {
      const eventsAndBreaks = coveredHours([...scheduledBreaks, ...stops])
      const accounted = coveredHours([
        ...scheduledBreaks,
        ...stops,
        ...intervals,
      ])
      return {
        machine,
        runtime: accounted - eventsAndBreaks,
        downtime: eventsAndBreaks - breakHours,
        missing: Math.max(0, hoursPerMachine - accounted),
      }
    })
    const roundHours = (value: number) => Math.round(value * 100) / 100
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
        "cnc-production-capacity": [...capacityByShift]
          .sort(([a], [b]) => a.localeCompare(b))
          .flatMap(([key, { capacity, actual, eligible }]) => [
            { label: `Shift ${key} · Actual`, value: actual },
            ...(eligible
              ? [{ label: `Shift ${key} · Session capacity`, value: capacity }]
              : []),
          ]),
        "cnc-shift-comparison": allSessionCount
          ? cncShifts.map((key) => ({
              label: "Shift " + key,
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
                value: roundHours(breakHours * fleetRows.length),
              },
            ]
          : [],
      },
      tables: {
        "cnc-shift-detail": {
          columns: [
            "Shift",
            "Pieces",
            "Rejected",
            "Downtime (min)",
            "Sessions",
          ],
          rows: cncShifts.map((key) => {
            const row = shiftTotals.get(key)
            return [
              `Shift ${key}`,
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
          rows: timeRows.map(({ machine, runtime, downtime, missing }) => [
            machine,
            roundHours(hoursPerMachine),
            roundHours(runtime),
            roundHours(downtime),
            roundHours(missing),
            roundHours(breakHours),
          ]),
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
                .map((shift) => `Shift ${shift}`)
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
