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
  deadline: string
  hoursPerDay: number
  efficiency: number
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
    !Number.isInteger(input.dispatchDays) ||
    input.dispatchDays < 0 ||
    input.dispatchDays > 365 ||
    !Number.isFinite(input.setupHours) ||
    input.setupHours < 0 ||
    input.setupHours > 720
  )
    throw new Error("Enter valid dispatch days and setup hours.")
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

// Each operation runs as a whole batch on one compatible machine. This deliberately
// avoids assuming that every product can be split across all machines in a family.
export function calculateProposal(
  input: ProposalInput,
  context: PlanningContext,
  lines: PlanningLine[]
): ProposalPlan {
  validateProposal(input)
  const daily = (input.hoursPerDay * input.efficiency) / 100
  const dates: string[] = []
  const end =
    input.mode === "deadline" ? input.deadline : addDays(input.startDate, 730)
  for (let date = input.startDate; date <= end; date = addDays(date, 1)) {
    if (
      new Date(`${date}T00:00:00Z`).getUTCDay() !== context.weeklyHoliday &&
      !context.holidays.includes(date)
    )
      dates.push(date)
  }
  const slot = (date: string) => {
    const index = dates.findIndex((day) => day >= date)
    return index < 0 ? dates.length * daily : index * daily
  }
  const dateAt = (hour: number) =>
    dates[Math.max(0, Math.ceil(hour / daily - 1e-9) - 1)] ?? ""
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
  function schedule(line: PlanningLine, target: Calendar, rm: string) {
    let ready = slot(rm > input.startDate ? rm : input.startDate)
    let first = -1
    const trial = clone(target)
    for (const operation of line.operations) {
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
      if (!best || best.end > dates.length * daily) return null
      if (first < 0) first = best.start
      const intervals = trial.get(best.machine)!
      intervals.push({ start: best.start, end: best.end })
      intervals.sort((a, b) => a.start - b.start)
      ready = best.end
    }
    const productionEnd = dateAt(ready)
    if (!productionEnd) return null
    const completion = addDays(productionEnd, input.dispatchDays)
    if (input.mode === "deadline" && completion > input.deadline) return null
    return {
      calendar: trial,
      completion,
      rmRequiredBy: dates[Math.floor(first / daily)] ?? "",
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
    const result = schedule(line, committed, rm)
    if (!result)
      blockers.push(
        `${line.id}: existing work does not fit the planning horizon.`
      )
    else committed = result.calendar
  }
  const load = (target: Calendar, machine: string) => {
    const boundary = Math.min(
      dates.length * daily,
      slot(addDays(input.deadline, 1))
    )
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
  const trials = candidates
    .map((candidate) => {
      let target = clone(committed)
      const results = new Map<string, LineResult>()
      for (const line of candidate) {
        const rm = input.mode === "deadline" ? input.startDate : line.rmDate
        const result =
          !blockers.length && !line.issue && rm
            ? schedule(line, target, rm)
            : null
        if (result) target = result.calendar
        results.set(line.id, {
          id: line.id,
          part: line.part,
          quantity: line.quantity,
          selected: Boolean(result),
          completion: result?.completion ?? "",
          rmRequiredBy: result?.rmRequiredBy ?? "",
          reason: blockers.length
            ? "Resolve existing workload blockers"
            : line.issue ||
              (!rm
                ? "Awaiting RM date"
                : result
                  ? input.mode === "deadline"
                    ? "Capacity feasible; conditional on RM"
                    : "Tentative; subject to RM"
                  : "Does not fit planning horizon"),
        })
      }
      const selected = [...results.values()].filter(
        (line) => line.selected
      ).length
      const utilisation = context.machines.reduce(
        (sum, machine) => sum + load(target, machine.id),
        0
      )
      return { target, results, selected, utilisation }
    })
    .sort((a, b) => b.selected - a.selected || b.utilisation - a.utilisation)
  const best = trials[0]!
  const availablePerMachine = Math.min(
    dates.length * daily,
    slot(addDays(input.deadline, 1))
  )
  return {
    version: context.version,
    blockers,
    method:
      input.mode === "deadline"
        ? "Best of four deterministic whole-batch schedules; maximum line count then utilised hours. Global optimum not proven."
        : "Input line order; whole-batch operations on compatible machines.",
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
