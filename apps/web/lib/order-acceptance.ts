import {
  createProductionPlanningSimulation,
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
  const simulate = createProductionPlanningSimulation({
    calendar,
    toolingAvailability: context.toolingAvailability ?? [],
    machines:
      context.machineRows ??
      context.machines.map((m) => ({
        machineNo: m.id,
        machineFamily: m.family,
        machineType: "CNC",
        status: "Active",
      })),
  })
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
    const planned = simulate({
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
      reservations: target.reservations,
      reservedPlans: target.plans,
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
  // Accepted schedules are append-only. The simulator copies protected rows
  // and replaces their metadata; nested tooling data is only read. Reusing a
  // transition therefore preserves branch isolation, including after failures.
  // Context, calendar and deadline are fixed for this synchronous calculation;
  // line identity and RM date capture the remaining simulation inputs.
  let scheduleResults = new WeakMap<
    Schedule,
    Map<PlanningLine, { rm: string; result: ReturnType<typeof schedule> }>
  >()
  let scheduleResultCount = 0
  const scheduleProposed = (
    line: PlanningLine,
    target: Schedule,
    rm: string
  ) => {
    if (input.mode !== "deadline") return schedule(line, target, rm, true)
    const cached = scheduleResults.get(target)?.get(line)
    if (cached?.rm === rm) return cached.result
    const result = schedule(line, target, rm, true)
    // Bound retained branches even for the largest proposals/refinement search.
    if (scheduleResultCount >= 4096) {
      scheduleResults = new WeakMap()
      scheduleResultCount = 0
    }
    let results = scheduleResults.get(target)
    if (!results) {
      results = new Map()
      scheduleResults.set(target, results)
    }
    results.set(line, { rm, result })
    scheduleResultCount += 1
    return result
  }
  // Only source-owned immutable plain inputs; no native fallback lookup on guards.
  const key = (value: string) => value.replace(/\s+/g, "").toLowerCase()
  const ordinary = (value: unknown, depth = 0): boolean => {
    if (value == null || typeof value === "string" || typeof value === "boolean") return true
    if (typeof value === "number") return Number.isFinite(value)
    if (typeof value !== "object" || depth > 20 || Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false
    if (Array.isArray(value)) {
      if (value.length > 16384) return false
      for (let index = 0; index < value.length; index += 1)
        if (!Object.hasOwn(value, index)) return false
    }
    const names = Reflect.ownKeys(value)
    return names.length <= 16384 && names.every(name => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name)
      return typeof name === "string" && !["__proto__", "constructor", "prototype", "toString", "valueOf", "toJSON"].includes(name) && !!descriptor && "value" in descriptor && ordinary(descriptor.value, depth + 1)
    })
  }
  const nativeMonths = ["Jan","Feb","Mar","Apr","May","June","July","Aug","Sept","Oct","Nov","Dec"]
  const inDateEra = (value: string) => validDate(value) && value >= "2000-01-01" && value < "2050-01-01"
  const nativeDate = (value: unknown) => {
    if (typeof value !== "string") return ""
    const date = iso(value)
    return inDateEra(date) && (value === date || value === formatCalendarDate(date) || value === Number(date.slice(8, 10)) + "-" + nativeMonths[Number(date.slice(5, 7)) - 1] + "-" + date.slice(2, 4)) ? date : ""
  }
  type FailureSnapshot = { references: Set<string>; windows: Map<string, Reservation[]> }
  const snapshots = new WeakMap<Schedule, FailureSnapshot | null>()
  const snapshot = (target: Schedule) => {
    if (snapshots.has(target)) return snapshots.get(target) ?? null
    const windows = new Map<string, Reservation[]>(), references = new Set<string>()
    let bound = input.deadline
    const includeEnd = (end: string) => {
      const next = addDays(end, 1)
      if (!validDate(next) || next <= end) return false
      if (next > bound) bound = next
      return true
    }
    const validPlan = (row: Record<string, unknown>) => {
      const start = nativeDate(row.plannedProductionStartDate), end = nativeDate(row.plannedProductionEndDate)
      return Object.hasOwn(row, "plannedProductionStartDate") && Object.hasOwn(row, "plannedProductionEndDate") && !!start && !!end && start <= end && includeEnd(end)
    }
    // Covers the native 5,000-date finish loop plus calendar shifts. Its
    // date labels must still round-trip within the certified 2000–2049 era.
    if (!Array.isArray(target.plans) || !Array.isArray(target.reservations) || !target.plans.every(row => row && typeof row === "object" && !Array.isArray(row) && validPlan(row))
      || !target.reservations.every(row => row && typeof row === "object" && typeof row.machine === "string" && !!key(row.machine) && inDateEra(row.start) && inDateEra(row.end) && row.start <= row.end && includeEnd(row.end))
      || !inDateEra(addDays(bound, 7000 + context.holidays.length))) {
      snapshots.set(target, null)
      return null
    }
    for (const row of target.reservations) windows.set(key(row.machine), [...windows.get(key(row.machine)) ?? [], row])
    const collect = (value: unknown): void => {
      if (typeof value === "string") { const token = key(value); if (token.startsWith("proposal:")) references.add(token) }
      else if (value && typeof value === "object") Object.getOwnPropertyNames(value).forEach(name => collect(Object.getOwnPropertyDescriptor(value, name)?.value))
    }
    target.plans.forEach(collect)
    const result = { references, windows }
    snapshots.set(target, result)
    return result
  }
  const covers = (facts: FailureSnapshot, machines: string[], ready: string) => machines.every(machine => {
    const relevant = (facts.windows.get(machine) ?? []).filter(row => row.end >= ready && row.start <= input.deadline)
    return relevant.length <= 20 && relevant.some(a => a.start <= ready && a.end >= ready && (a.end >= input.deadline || relevant.some(b => b.start <= addDays(a.end, 1) && b.end >= input.deadline)))
  })
  const prepared = new WeakMap<PlanningLine, string[]>()
  const bindingsMatch = (facts: Record<string, unknown> | undefined, line: PlanningLine, op: Operation) => facts == null || (typeof facts === "object" && !Array.isArray(facts) && Object.entries(facts).every(([name, value]) => {
    const header = name.replace(/[^a-z0-9]/gi, "").toLowerCase()
    const expected = header === "partno" || header === "partcode" ? key(line.part) : header === "optionnumber" ? line.option || "1" : header === "setupno" || header === "setupcode" ? op.setup : undefined
    return expected === undefined || (typeof value === "string" && (header === "partno" || header === "partcode" ? key(value) : value.trim()) === expected)
  }))
  if (input.mode === "deadline" && !blockers.length && inDateEra(input.startDate) && inDateEra(input.deadline) && ordinary([input, context, lines])
    && (context.machineRows == null || (Array.isArray(context.machineRows) && context.machineRows.every(row => row && typeof row === "object" && !Array.isArray(row))))) {
    const rows: Record<string, unknown>[] = context.machineRows ?? context.machines.map(m => ({ machineNo: m.id, machineFamily: m.family }))
    const familyNames = ["machineFamily", "MACHINE FAMILY", "Machine Family"]
    const masters = rows.map(row => ({
      family: familyNames.some(name => row[name] != null && typeof row[name] !== "string") ? undefined : key(String(familyNames.map(name => row[name]).find(value => typeof value === "string" && value.trim()) ?? "")),
      machine: ["machine", "machineNo", "MACHINE NO", "M/C NO", "MACHINE NO."].map(name => row[name]).find(value => value !== undefined && value !== null && value !== ""),
    }))
    const base = snapshot(committed), ready = input.tentativeRmDate || input.startDate
    if (base && masters.every(master => master.family !== undefined)) for (const line of lines) {
      if (!line || typeof line !== "object" || typeof line.id !== "string" || !line.id.trim() || typeof line.part !== "string" || !line.part.trim() || typeof line.option !== "string" || [line.id, line.part, line.option].some(value => value.includes("|")) || !Array.isArray(line.operations)) continue
      const first = line.operations[0], quantity = first?.quantity ?? line.quantity
      if (!first || line.issue || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0
        || !line.operations.every(op => op && typeof op === "object" && typeof op.setup === "string" && /^[1-9]\d*$/.test(op.setup) && Number.isSafeInteger(Number(op.setup)) && typeof op.family === "string")
        || !line.operations.every(op => bindingsMatch(op.cycle, line, op) && bindingsMatch(op.tooling, line, op))
        || new Set(line.operations.map(op => op.setup)).size !== line.operations.length
        || !first.family.trim() || line.operations.some(op => Number(op.setup) < Number(first.setup))) continue
      if (["fixture", "FIXTURE", "tooling", "TOOLING", "foamTool", "FOAM TOOL"].some(name => {
        const value = first.tooling?.[name]
        return value != null && !["", "-", "NA", "N/A", "NONE", "NOT REQUIRED", "NO"].includes(String(value).trim().toUpperCase())
      }) || Object.getOwnPropertyNames(first.cycle ?? {}).some(name => name.toUpperCase().replace(/\s+/g, " ").trim() === "CYCLEREVISIONEFFECTIVEAT" && String(first.cycle?.[name] ?? "").trim())) continue
      const rawCycle = first.cycle?.cycleTime ?? (typeof first.hours === "number" ? first.hours * 3600 / quantity : NaN)
      if (typeof rawCycle !== "string" && typeof rawCycle !== "number") continue
      const cycle = Number(rawCycle)
      const compatible = masters.filter(master => master.family === key(first.family))
      if (!Number.isFinite(cycle) || cycle <= 0 || !compatible.length || compatible.some(master => typeof master.machine !== "string" || !key(master.machine))) continue
      // Include inactive/type-incompatible family members: a safe physical superset.
      const machines = [...new Set(compatible.flatMap(master => typeof master.machine === "string" ? [key(master.machine)] : []))]
      if (machines.length !== 1 || line.operations.slice(1).some(op => masters.filter(master => master.family === key(op.family)).some(master =>
        typeof master.machine !== "string" || !key(master.machine) || machines.includes(key(master.machine))))) continue
      if (covers(base, machines, ready)) prepared.set(line, machines)
    }
  }
  // An isolated first machine blocked through the deadline guarantees failure;
  // final result entries still use the full planner for their exact reasons.
  const certifiedFailure = (line: PlanningLine, target: Schedule, rm: string) => {
    const machines = prepared.get(line), facts = machines ? snapshot(target) : null
    const ready = rm > input.startDate ? rm : input.startDate
    return !!facts && !!machines && inDateEra(ready) && ready <= input.deadline && !facts.references.has(key("proposal:" + line.id)) && covers(facts, machines, ready)
  }
  const deferredFailures = new WeakMap<LineResult, { line: PlanningLine; target: Schedule; rm: string }>()
  const trial = (candidate: PlanningLine[], minimumSelected: number) => {
    let target = committed
    const results = new Map<string, LineResult>()
    let selectedCount = 0
    for (const [index, line] of candidate.entries()) {
      // Each remaining line can add at most one selected ID. Ties must finish
      // because utilisation still decides between equal selected counts.
      if (selectedCount + candidate.length - index < minimumSelected)
        return null
      const rm =
        input.mode === "deadline"
          ? input.tentativeRmDate || input.startDate
          : line.rmDate
      const deferredFailure = !blockers.length && !line.issue && !!rm && certifiedFailure(line, target, rm)
      const result =
        !blockers.length && !line.issue && rm && !deferredFailure
          ? scheduleProposed(line, target, rm)
          : null
      const selected = !!result && !result.reason
      if (selected) target = result.target
      // Results are keyed by ID; an overwrite can remove a selected line.
      if (results.get(line.id)?.selected) selectedCount -= 1
      if (selected) selectedCount += 1
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
        reason: deferredFailure ? "" :
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
      if (deferredFailure) deferredFailures.set(results.get(line.id)!, { line, target, rm })
    }
    return {
      candidate,
      target,
      results,
      selected: selectedCount,
      utilisation: context.machines.reduce(
        (sum, m) => sum + load(target, m.id),
        0
      ),
    }
  }
  type CompletedTrial = NonNullable<ReturnType<typeof trial>>
  const compare = (a: CompletedTrial, b: CompletedTrial) =>
    b.selected - a.selected || b.utilisation - a.utilisation
  const completed: CompletedTrial[] = []
  let minimumSelected = 0
  for (const candidate of candidates) {
    const result = trial(candidate, minimumSelected)
    if (!result) continue
    completed.push(result)
    minimumSelected = Math.max(minimumSelected, result.selected)
  }
  let best = completed.sort(compare)[0]!
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
        ),
        best.selected
      )
      if (repaired && compare(best, repaired) > 0) best = repaired
    }
  for (const entry of best.results.values()) {
    const deferred = deferredFailures.get(entry)
    if (deferred) entry.reason = schedule(deferred.line, deferred.target, deferred.rm, true).reason
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
