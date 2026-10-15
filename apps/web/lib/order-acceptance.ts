import { plannedWipBufferReadyDate } from "@workspace/db/dashboard-analysis"

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
export type Operation = { family: string; hours: number; setup: string }
export type PlanningLine = ProposedLine & {
  operations: Operation[]
  issue: string
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
}
export type LineResult = {
  id: string
  part: string
  quantity: number
  selected: boolean
  completion: string
  rmRequiredBy: string
  reason: string
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
      throw new Error(`Invalid RM date for ${line.id}. Use YYYY-MM-DD.`)
  }
  for (const date of Object.values(input.existingRmDates))
    if (date && !validDate(date))
      throw new Error("Existing RM dates must use YYYY-MM-DD.")
}

// One machine per operation; route setups can overlap using canonical forecast WIP.
export function calculateProposal(
  input: ProposalInput,
  context: PlanningContext,
  lines: PlanningLine[]
): ProposalPlan {
  validateProposal(input)
  const daily = (input.hoursPerDay * input.efficiency) / 100
  const dates: string[] = []
  // Old commitments can extend beyond the proposed order's deadline.
  const end = addDays(input.startDate, 730)
  for (let date = input.startDate; date <= end; date = addDays(date, 1)) {
    if (
      (context.workingDates?.includes(date) ||
        new Date(`${date}T00:00:00Z`).getUTCDay() !== context.weeklyHoliday) &&
      !context.holidays.includes(date)
    )
      dates.push(date)
  }
  const slot = (date: string) => {
    const index = dates.findIndex((day) => day >= date)
    return index < 0 ? totalCapacity : offsets[index]!
  }
  const offsets = [0]
  for (const date of dates)
    offsets.push(
      offsets[offsets.length - 1]! +
        daily * (context.capacityFractions?.[date] ?? 1)
    )
  const totalCapacity = offsets[offsets.length - 1]!
  const planningCalendar = {
    holidayDates: new Set(context.holidays),
    workingDates: new Set(context.workingDates ?? []),
    productiveHoursPerDay: daily,
    capacityFractions: context.capacityFractions,
  }
  const dateAt = (hour: number) => {
    const index = offsets.findIndex(
      (end, index) => index > 0 && end + 1e-9 >= hour
    )
    return index < 1 ? "" : (dates[index - 1] ?? "")
  }
  type Interval = { start: number; end: number }
  type Calendar = Map<string, Interval[]>
  const clone = (calendar: Calendar): Calendar =>
    new Map(
      [...calendar].map(([key, intervals]) => [
        key,
        intervals.map((interval) => ({ ...interval })),
      ])
    )
  const calendar: Calendar = new Map(
    context.machines.map((machine) => [machine.id, []])
  )
  for (const reservation of context.reservations) {
    const target = calendar.get(reservation.machine)
    if (target)
      target.push({
        start: slot(reservation.start),
        end: slot(addDays(reservation.end, 1)),
      })
  }
  for (const intervals of calendar.values())
    intervals.sort((a, b) => a.start - b.start)
  function schedule(
    line: PlanningLine,
    target: Calendar,
    rm: string,
    proposed = true
  ) {
    const fail = (reason: string) => ({
      calendar: null,
      completion: "",
      rmRequiredBy: "",
      reason,
    })
    let ready = slot(rm > input.startDate ? rm : input.startDate)
    let first = -1
    let lastFinish = 0
    const trial = clone(target)
    let previous:
      | { operation: Operation; machine: string; start: number; end: number }
      | undefined
    for (const operation of line.operations) {
      if (previous) {
        const upstream = previous
        const productionStart = upstream.start + input.setupHours
        const startIndex =
          offsets.findIndex(
            (end, index) => index > 0 && end > productionStart + 1e-9
          ) - 1
        const wipDate = plannedWipBufferReadyDate({
          productionStreams: [
            {
              machine: upstream.machine,
              startDate: dates[startIndex] ?? "",
              startWorkingHours: productionStart - (offsets[startIndex] ?? 0),
              endDate: dateAt(upstream.end),
              quantity: line.quantity,
              dailyQty:
                upstream.operation.hours > 0
                  ? (line.quantity * daily) / upstream.operation.hours
                  : 0,
            },
          ],
          orderPcs: line.quantity,
          previousCycle: {
            cycleTime: (upstream.operation.hours * 3600) / line.quantity,
          },
          nextCycle: { cycleTime: (operation.hours * 3600) / line.quantity },
          planningCalendar,
        })
        if (!wipDate)
          return fail(
            `Setup ${operation.setup} (${operation.family}): forecast WIP cannot support this run.`
          )
        ready = slot(wipDate)
      }
      const duration = operation.hours + input.setupHours
      let best: { machine: string; start: number; end: number } | undefined
      for (const machine of context.machines.filter(
        (machine) => machine.family === operation.family
      )) {
        let start = ready
        for (const interval of trial.get(machine.id) ?? []) {
          if (start + duration <= interval.start + 1e-9) break
          if (start < interval.end) start = interval.end
        }
        const end = start + duration
        if (!best || end < best.end) best = { machine: machine.id, start, end }
      }
      const limit =
        proposed && input.mode === "deadline"
          ? slot(addDays(input.deadline, 1))
          : totalCapacity
      if (!best)
        return fail(
          `Setup ${operation.setup}: no compatible ${operation.family} machine.`
        )
      if (best.end > limit)
        return fail(
          `Setup ${operation.setup} (${operation.family}): needs ${duration.toFixed(1)} uninterrupted hours after WIP and machine availability; earliest finish ${dateAt(best.end) || "beyond planning horizon"}${proposed && input.mode === "deadline" ? `, after deadline ${input.deadline}` : ""}.`
        )
      if (first < 0) first = best.start
      const intervals = trial.get(best.machine)!
      intervals.push({ start: best.start, end: best.end })
      intervals.sort((a, b) => a.start - b.start)
      previous = { operation, ...best }
      lastFinish = Math.max(lastFinish, best.end)
    }
    const productionEnd = dateAt(lastFinish)
    if (!productionEnd) return fail("Does not fit planning horizon")
    const completion = productionEnd
    if (proposed && input.mode === "deadline" && completion > input.deadline)
      return fail("Does not fit planning horizon")
    return {
      calendar: trial,
      reason: "",
      completion,
      rmRequiredBy:
        dates[
          offsets.findIndex((end, index) => index > 0 && end > first + 1e-9) - 1
        ] ?? "",
    }
  }
  const blockers = [...context.blockers]
  let committed = calendar
  for (const line of context.existing) {
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
    if (!result.calendar)
      blockers.push(
        `${line.id}: existing work does not fit the planning horizon.`
      )
    else committed = result.calendar
  }
  const load = (target: Calendar, machine: string) => {
    const boundary = Math.min(totalCapacity, slot(addDays(input.deadline, 1)))
    let total = 0,
      through = 0
    for (const interval of target.get(machine) ?? []) {
      const start = Math.max(through, interval.start)
      const end = Math.min(boundary, interval.end)
      total += Math.max(0, end - start)
      through = Math.max(through, interval.end)
    }
    return total
  }
  const hours = (line: PlanningLine) =>
    line.operations.reduce(
      (sum, operation) => sum + operation.hours + input.setupHours,
      0
    )
  const familyMachines = (family: string) =>
    context.machines.filter((machine) => machine.family === family).length
  const dominant = (line: PlanningLine) =>
    Math.max(
      0,
      ...line.operations.map(
        (operation) =>
          (operation.hours + input.setupHours) /
          Math.max(1, familyMachines(operation.family))
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
    let target = clone(committed)
    const results = new Map<string, LineResult>()
    for (const line of candidate) {
      const rm =
        input.mode === "deadline"
          ? input.tentativeRmDate || input.startDate
          : line.rmDate
      const result =
        !blockers.length && !line.issue && rm
          ? schedule(line, target, rm)
          : null
      if (result?.calendar) target = result.calendar
      results.set(line.id, {
        id: line.id,
        part: line.part,
        quantity: line.quantity,
        selected: Boolean(result?.calendar),
        completion: result?.completion ?? "",
        rmRequiredBy: result?.rmRequiredBy ?? "",
        reason:
          line.issue ||
          (blockers.length
            ? "Resolve existing workload blockers"
            : !rm
              ? "Awaiting RM date"
              : result?.calendar
                ? input.mode === "deadline"
                  ? "Capacity feasible; conditional on RM"
                  : "Tentative; subject to RM"
                : result?.reason || "Does not fit planning horizon"),
      })
    }
    const selected = [...results.values()].filter(
      (line) => line.selected
    ).length
    const utilisation = context.machines.reduce(
      (sum, machine) => sum + load(target, machine.id),
      0
    )
    return { candidate, target, results, selected, utilisation }
  }
  const compare = (a: ReturnType<typeof trial>, b: ReturnType<typeof trial>) =>
    b.selected - a.selected || b.utilisation - a.utilisation
  let best = candidates.map(trial).sort(compare)[0]!
  if (input.mode === "deadline" && !blockers.length) {
    // Reorder a shared-family queue without disturbing unrelated line positions.
    // Long operations first can avoid stranding a large job behind short ones.
    for (const family of [
      ...new Set(
        lines.flatMap((line) => line.operations.map((op) => op.family))
      ),
    ].sort()) {
      const familyHours = (line: PlanningLine) =>
        line.operations
          .filter((op) => op.family === family)
          .reduce((total, op) => total + op.hours + input.setupHours, 0)
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
      const reordered = best.candidate.map((line) =>
        familyHours(line) > 0 ? queue[index++]! : line
      )
      const repaired = trial(reordered)
      if (compare(best, repaired) > 0) best = repaired
    }
  }
  const availablePerMachine = Math.min(
    totalCapacity,
    slot(addDays(input.deadline, 1))
  )
  return {
    version: context.version,
    blockers,
    method:
      input.mode === "deadline"
        ? "Four deterministic WIP-aware schedules with family-queue refinement; maximum line count then utilised hours. Global optimum not proven."
        : "Input line order; canonical forecast WIP between setups on compatible machines.",
    lines: lines.map((line) => best.results.get(line.id)!),
    families: [...new Set(context.machines.map((machine) => machine.family))]
      .sort()
      .map((family) => {
        const machines = context.machines.filter(
          (machine) => machine.family === family
        )
        const existing = machines.reduce(
          (sum, machine) => sum + load(committed, machine.id),
          0
        )
        const used = machines.reduce(
          (sum, machine) => sum + load(best.target, machine.id),
          0
        )
        const available = machines.length * availablePerMachine
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
