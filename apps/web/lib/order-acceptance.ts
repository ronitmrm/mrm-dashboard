import {
  simulateProductionPlanning,
  workOrderPlanningSort,
} from "@workspace/db/dashboard-analysis"
import { formatCalendarDate, parseCalendarDateInput } from "@workspace/ui/lib/calendar-date"

export type ProposedLine = {
  id: string
  part: string
  option: string
  quantity: number
  rmDate: string
}
export type ProposalInput = {
  reference: string
  revisionOf: string
  startDate: string
  tentativeRmDate?: string
  deadline: string
  hoursPerDay: number
  efficiency: number
  // Saved proposals retain this field at zero; completion is machining only.
  dispatchDays: number
  setupHours: number
  mode: "dates" | "deadline"
  lines: ProposedLine[]
  existingRmDates: Record<string, string>
}
export type Operation = {
  family: string
  hours: number
  setup: string
  quantity?: number
  machineType?: string
  tooling?: Record<string, unknown>
  cycle?: Record<string, unknown>
}
export type PlanningLine = ProposedLine & {
  operations: Operation[]
  issue: string
  plannerPriorityScore?: number
  deliveryDate?: string
}
export type Reservation = { machine: string; start: string; end: string }
export type PlanningContext = {
  version: number
  machines: { id: string; family: string }[]
  holidays: string[]
  workingDates?: string[]
  capacityFractions?: Record<string, number>
  weeklyHoliday: number
  existing: PlanningLine[]
  reservations: Reservation[]
  blockers: string[]
  productiveHoursPerDay?: number
  machineRows?: Record<string, unknown>[]
  toolingAvailability?: Record<string, unknown>[]
  reservedPlans?: Record<string, unknown>[]
}
export type LineResult = {
  id: string
  part: string
  quantity: number
  selected: boolean
  completion: string
  rmRequiredBy: string
  reason: string
  machinePlan?: {
    setup: string
    machine: string
    quantity: number
    start: string
    end: string
  }[]
}
export type ProposalPlan = {
  version: number
  lines: LineResult[]
  families: {
    family: string
    machines: number
    available: number
    committed: number
    proposed: number
    utilisation: number
  }[]
  blockers: string[]
  method: string
}

export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function validateProposal(input: ProposalInput) {
  if (!input.reference.trim() || input.reference.length > 150)
    throw new Error("Enter a proposal reference (maximum 150 characters).")
  if (
    !validDate(input.startDate) ||
    !validDate(input.deadline) ||
    input.deadline < input.startDate ||
    input.deadline > addDays(input.startDate, 730)
  )
    throw new Error("Use a valid planning period of at most two years.")
  if (
    !(input.hoursPerDay > 0 && input.hoursPerDay <= 24) ||
    !(input.efficiency > 0 && input.efficiency <= 100)
  )
    throw new Error("Enter valid daily hours and available time percentage.")
  if (
    input.mode === "deadline" &&
    input.tentativeRmDate &&
    (!validDate(input.tentativeRmDate) ||
      input.tentativeRmDate > input.deadline)
  )
    throw new Error(
      "Use a valid tentative RM date on or before the machining deadline."
    )
  if (
    !Number.isFinite(input.setupHours) ||
    input.setupHours < 0 ||
    input.setupHours > 720
  )
    throw new Error("Enter valid setup hours.")
  if (!["dates", "deadline"].includes(input.mode))
    throw new Error("Invalid planning mode.")
  if (!input.lines.length || input.lines.length > 1000)
    throw new Error("Upload between 1 and 1,000 proposed lines.")
  if (new Set(input.lines.map((line) => line.id)).size !== input.lines.length)
    throw new Error("Line references must be unique.")
  for (const line of input.lines) {
    if (
      !line.id.trim() ||
      !line.part.trim() ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > 100000000
    )
      throw new Error(
        "Every line needs a reference, product and positive whole-piece quantity."
      )
    if (line.rmDate && !validDate(line.rmDate))
      throw new Error(`Invalid RM date for ${line.id}. Enter DD/MM/YYYY.`)
  }
  for (const date of Object.values(input.existingRmDates))
    if (date && !validDate(date))
      throw new Error("Enter existing RM dates in DD/MM/YYYY format.")
}

// All machine/route scheduling is delegated to the actual production planner.
export function calculateProposal(
  input: ProposalInput,
  context: PlanningContext,
  lines: PlanningLine[]
): ProposalPlan {
  validateProposal(input)
  const daily =
    context.productiveHoursPerDay ??
    (input.hoursPerDay * input.efficiency) / 100
  const calendar = {
    holidayDates: new Set(context.holidays),
    workingDates: new Set(context.workingDates ?? []),
    capacityFractions: context.capacityFractions,
    productiveHoursPerDay: daily,
    currentProductionDate: input.startDate,
  }
  const horizon = addDays(input.startDate, 730)
  const dates: string[] = []
  for (let date = input.startDate; date <= horizon; date = addDays(date, 1)) {
    if (
      (context.workingDates?.includes(date) ||
        new Date(`${date}T00:00:00Z`).getUTCDay() !== context.weeklyHoliday) &&
      !context.holidays.includes(date)
    )
      dates.push(date)
  }
  const iso = (value: unknown) => {
    const raw = String(value ?? "")
    if (validDate(raw)) return raw
    return parseCalendarDateInput(formatCalendarDate(raw)) ?? ""
  }
  const reservationsFor = (plans: Record<string, unknown>[]): Reservation[] =>
    plans.flatMap((row) => {
      const start = iso(row.plannedProductionStartDate),
        end = iso(row.plannedProductionEndDate),
        machine = String(row.machine ?? "")
      return machine && start && end ? [{ machine, start, end }] : []
    })
  type Schedule = {
    plans: Record<string, unknown>[]
    reservations: Reservation[]
  }
  const initial: Schedule = {
    plans: context.reservedPlans ?? [],
    reservations: context.reservations,
  }
  function schedule(
    line: PlanningLine,
    target: Schedule,
    rm: string,
    proposed: boolean
  ) {
    const id = `proposal:${line.id}`
    const ready = rm > input.startDate ? rm : input.startDate
    const routes = line.operations.map((op) => ({
      partNo: line.part,
      optionNumber: line.option || "1",
      setupNo: op.setup,
      machineFamily: op.family,
      machineUsed: op.family,
      machineType: op.machineType || "CNC",
    }))
    const cycles = line.operations.map((op, index) => ({
      ...routes[index],
      ...op.cycle,
      cycleTime:
        op.cycle?.cycleTime ??
        (op.hours * 3600) / (op.quantity ?? line.quantity),
    }))
    const tooling = line.operations.map((op, index) => ({
      ...routes[index],
      ...op.tooling,
    }))
    const planned = simulateProductionPlanning({
      workOrders: [
        {
          jcNo: id,
          partCode: line.part,
          optionNumber: line.option || "1",
          orderPcs: line.quantity,
          materialPlanningReady: true,
          rmInwardDate: ready,
          rmStatus: "Received",
          routeChangeRemainingSetups: line.operations.map((op) => ({
            setupNo: op.setup,
            quantity: op.quantity ?? line.quantity,
            plan: true,
          })),
        },
      ],
      routes,
      cycles,
      tooling,
      toolingAvailability: context.toolingAvailability ?? [],
      machines:
        context.machineRows ??
        context.machines.map((m) => ({
          machineNo: m.id,
          machineFamily: m.family,
          machineType: "CNC",
          status: "Active",
        })),
      reservations: target.reservations,
      reservedPlans: target.plans,
      calendar,
      deadline:
        proposed && input.mode === "deadline" ? input.deadline : horizon,
    })
    const reasons: string[] = []
    for (const op of line.operations) {
      const own = planned.filter((row) => String(row.setupNo) === op.setup)
      const end =
        own
          .map((row) => iso(row.plannedProductionEndDate))
          .sort()
          .at(-1) ?? ""
      if (
        !own.length ||
        !end ||
        own.some((row) => !iso(row.plannedProductionEndDate))
      )
        reasons.push(
          `Setup ${op.setup} (${op.family}): ${String(own.find((row) => row.toolingPlanBlocked)?.toolingPlanStatus ?? "production planner cannot assign a feasible machine/tooling plan")}`
        )
      else if (
        end > (proposed && input.mode === "deadline" ? input.deadline : horizon)
      )
        reasons.push(
          `Setup ${op.setup} (${op.family}): finishes ${end}, after ${proposed && input.mode === "deadline" ? "deadline " + input.deadline : "planning horizon"}.`
        )
    }
    const completion =
      planned
        .map((row) => iso(row.plannedProductionEndDate))
        .sort()
        .at(-1) ?? ""
    const rmRequiredBy =
      planned
        .filter((row) => String(row.setupNo) === line.operations[0]?.setup)
        .map((row) => iso(row.plannedProductionStartDate))
        .filter(Boolean)
        .sort()[0] ?? ""
    return {
      reason: reasons.join(" "),
      completion,
      rmRequiredBy,
      plans: planned,
      target: {
        plans: [...target.plans, ...planned],
        reservations: [...target.reservations, ...reservationsFor(planned)],
      },
    }
  }
  const blockers = [...context.blockers]
  let committed = initial
  for (const line of [...context.existing].sort((a, b) =>
    workOrderPlanningSort(
      { ...a, jcNo: a.id, rmInwardDate: a.rmDate },
      { ...b, jcNo: b.id, rmInwardDate: b.rmDate }
    )
  )) {
    const rm =
      input.mode === "deadline"
        ? input.startDate
        : line.rmDate || input.existingRmDates[line.id] || ""
    if (line.issue || !rm) {
      blockers.push(`${line.id}: ${line.issue || "awaiting tentative RM date"}`)
      continue
    }
    if (!line.operations.length) continue
    const result = schedule(line, committed, rm, false)
    if (result.reason) blockers.push(`${line.id}: ${result.reason}`)
    else committed = result.target
  }
  const availablePerMachine = dates
    .filter((date) => date <= input.deadline)
    .reduce(
      (sum, date) => sum + daily * (context.capacityFractions?.[date] ?? 1),
      0
    )
  // Count occupied production dates just as the actual planner reserves machines.
  const load = (target: Schedule, machine: string) =>
    dates
      .filter(
        (date) =>
          date <= input.deadline &&
          target.reservations.some(
            (row) =>
              row.machine === machine && row.start <= date && row.end >= date
          )
      )
      .reduce(
        (sum, date) => sum + daily * (context.capacityFractions?.[date] ?? 1),
        0
      )
  const hours = (line: PlanningLine) =>
    line.operations.reduce((sum, op) => sum + op.hours, 0)
  const dominant = (line: PlanningLine) =>
    Math.max(
      0,
      ...line.operations.map(
        (op) =>
          op.hours /
          Math.max(
            1,
            context.machines.filter((m) => m.family === op.family).length
          )
      )
    )
  const candidates =
    input.mode === "dates"
      ? [lines]
      : [
          [...lines].sort((a, b) => hours(a) - hours(b)),
          [...lines].sort((a, b) => dominant(a) - dominant(b)),
          [...lines].sort((a, b) => hours(b) - hours(a)),
          lines,
        ]
  const trial = (candidate: PlanningLine[]) => {
    let target = committed
    const results = new Map<string, LineResult>()
    for (const line of candidate) {
      const rm =
        input.mode === "deadline"
          ? input.tentativeRmDate || input.startDate
          : line.rmDate
      const result =
        !blockers.length && !line.issue && rm
          ? schedule(line, target, rm, true)
          : null
      const selected = !!result && !result.reason
      if (selected) target = result.target
      results.set(line.id, {
        id: line.id,
        part: line.part,
        quantity: line.quantity,
        selected,
        machinePlan: selected
          ? result.plans.map((row) => ({
              setup: String(row.setupNo),
              machine: String(row.machine),
              quantity: Number(row.orderPcs),
              start: iso(row.plannedProductionStartDate),
              end: iso(row.plannedProductionEndDate),
            }))
          : [],
        completion: selected ? result.completion : "",
        rmRequiredBy: selected ? result.rmRequiredBy : "",
        reason:
          line.issue ||
          (blockers.length
            ? "Resolve existing workload blockers"
            : !rm
              ? "Awaiting RM date"
              : result?.reason ||
                (input.mode === "deadline"
                  ? "Capacity feasible; conditional on RM"
                  : "Tentative; subject to RM")),
      })
    }
    return {
      candidate,
      target,
      results,
      selected: [...results.values()].filter((row) => row.selected).length,
      utilisation: context.machines.reduce(
        (sum, m) => sum + load(target, m.id),
        0
      ),
    }
  }
  const compare = (a: ReturnType<typeof trial>, b: ReturnType<typeof trial>) =>
    b.selected - a.selected || b.utilisation - a.utilisation
  let best = candidates.map(trial).sort(compare)[0]!
  if (input.mode === "deadline" && !blockers.length)
    for (const family of [
      ...new Set(
        lines.flatMap((line) => line.operations.map((op) => op.family))
      ),
    ].sort()) {
      const familyHours = (line: PlanningLine) =>
        line.operations
          .filter((op) => op.family === family)
          .reduce((sum, op) => sum + op.hours, 0)
      if (
        !lines.some(
          (line) =>
            !best.results.get(line.id)?.selected && familyHours(line) > 0
        )
      )
        continue
      const queue = best.candidate
        .filter((line) => familyHours(line) > 0)
        .sort((a, b) => familyHours(b) - familyHours(a))
      let index = 0
      const repaired = trial(
        best.candidate.map((line) =>
          familyHours(line) > 0 ? queue[index++]! : line
        )
      )
      if (compare(best, repaired) > 0) best = repaired
    }
  return {
    version: context.version,
    blockers,
    method:
      "Actual production planner simulation: parallel machining, pooled WIP, tooling, machine continuity and protected commitments. Four proposal orders plus family-queue refinement; global optimum not proven.",
    lines: lines.map((line) => best.results.get(line.id)!),
    families: [...new Set(context.machines.map((m) => m.family))]
      .sort()
      .map((family) => {
        const machines = context.machines.filter((m) => m.family === family)
        const available = machines.length * availablePerMachine
        const existing = machines.reduce(
          (sum, m) => sum + load(committed, m.id),
          0
        )
        const used = machines.reduce(
          (sum, m) => sum + load(best.target, m.id),
          0
        )
        return {
          family,
          machines: machines.length,
          available,
          committed: existing,
          proposed: used - existing,
          utilisation: available ? used / available : 0,
        }
      }),
  }
}
