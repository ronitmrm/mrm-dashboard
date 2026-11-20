import { createHash } from "node:crypto"
import {
  buildProductionPlanningControl,
  type LegacyDashboardInput,
} from "./legacy-dashboard-analysis"
import {
  machineFamilyMatches,
  machineMasterFamily,
  planningProductionDate,
} from "./planning-rules"
import { requiredToolingCodes } from "./tooling-availability"

type Row = Record<string, unknown>
export const deliveryRecord = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {}
const rows = (value: unknown) =>
  Array.isArray(value) ? value.map(deliveryRecord) : []
const text = (value: unknown) => String(value ?? "").trim()
const same = (a: unknown, b: unknown) =>
  text(a).toUpperCase() === text(b).toUpperCase()
function iso(value: unknown) {
  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : ""
}
const active = (row: Row) =>
  row.shopFloorStage !== "item_complete" && row.runningStatus !== "Complete"
const locked = (row: Row) =>
  active(row) &&
  (Number(row.rawActualQty) > 0 ||
    [
      "raw_material_at_machine",
      "presetting",
      "setting",
      "quality_approval",
      "operator_started",
    ].includes(text(row.shopFloorStage)))
const controlOf = (input: LegacyDashboardInput, calculationTime: number) =>
  deliveryRecord(buildProductionPlanningControl(input, calculationTime))

export type UrgentDeliveryInput = {
  jobCardNumber: string
  preferredDate: string
}
export type DeliveryMachineAction = {
  assignmentMode: "move" | "add_parallel_machine"
  setupNumber: number
  fromMachineNumber: string
  toMachineNumber: string
  queuePlacements: {
    targetJobCardNumber: string
    targetSetupNumber: number
    targetMachineNumber: string
    targetSourceMachineNumber: string
    queueBeforeSetups: {
      jobCardNumber: string
      setupNumber: number
      machineNumber: string
    }[]
  }[]
}
export type UrgentDeliveryPlan = {
  fingerprint: string
  jobCardNumber: string
  partCode: string
  preferredDate: string
  currentFinish: string
  proposedFinish: string
  remainingQuantity: number
  meetsDate: boolean
  priorityChange: boolean
  actions: DeliveryMachineAction[]
  machines: {
    setup: string
    machine: string
    remaining: number
    start: string
    finish: string
  }[]
  impacts: {
    jobCardNumber: string
    partCode: string
    currentFinish: string
    proposedFinish: string
  }[]
  blockers: string[]
  notes: string[]
}

export function validateUrgentDelivery(
  input: UrgentDeliveryInput,
  today: string
) {
  if (!input.jobCardNumber.trim() || input.jobCardNumber.length > 100)
    throw new Error("Select a Job Card.")
  const date = input.preferredDate
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date < today ||
    Number(date.slice(0, 4)) > Number(today.slice(0, 4)) + 2
  )
    throw new Error(
      "Choose a valid preferred finish date from today within the next two years."
    )
}

export function simulateUrgentDelivery(
  source: LegacyDashboardInput,
  input: UrgentDeliveryInput,
  calculationTime = Date.now()
): UrgentDeliveryPlan {
  const today = planningProductionDate(
    source.productionFloorCode,
    new Date(calculationTime)
  )
  validateUrgentDelivery(input, today)
  const baseline = controlOf(source, calculationTime)
  const work = rows(baseline.workOrders).find((row) =>
    same(row.jcNo, input.jobCardNumber)
  )
  if (!work) throw new Error("Job Card was not found in this production unit.")
  const jc = text(work.jcNo),
    part = text(work.partCode)
  const ownRows = (control: Row) =>
    rows(control.machinePlanDetailRows).filter(
      (row) => same(row.jcNo, jc) && active(row)
    )
  const finishMap = (control: Row) =>
    new Map(
      rows(control.productionDashboardRows).map((row) => [
        text(row.jcNo),
        {
          partCode: text(row.partCode),
          finish: iso(row.currentProbableDispatchDate),
        },
      ])
    )
  const baselineFinishes = finishMap(baseline)
  const finish = (control: Row) => finishMap(control).get(jc)?.finish ?? ""
  const blockers: string[] = []
  const remainingQuantity = Math.max(
    0,
    Number(work.orderPcs) - (Number(work.finalSetupGoodPieces) || 0)
  )
  if (remainingQuantity <= 0 || work.dispatchStatus === "Shifted to dispatch")
    blockers.push("This Job Card has no remaining production quantity.")
  if (work.rmStatus !== "Received")
    blockers.push(
      "Raw material is not ready. Resolve material availability before simulating urgent production."
    )
  if (!finish(baseline))
    blockers.push(
      "Current probable finish is unavailable. Resolve route, cycle, tooling or WIP planning gaps first."
    )
  if (rows(baseline.masterGaps).some((row) => same(row.jcNo, jc)))
    blockers.push("Resolve this Job Card's missing planning masters first.")
  if (rows(baseline.plannerActionConflicts).length)
    blockers.push("Resolve pending Planner Action conflicts before simulating.")
  const setupNumbers = [
    ...new Set(ownRows(baseline).map((row) => text(row.setupNo))),
  ].sort((a, b) => Number(a) - Number(b))
  if (!setupNumbers.length)
    blockers.push("No active setup is available in the machine plan.")
  const priority = {
    target: jc,
    jobCardNumber: jc,
    jcNo: jc,
    partCode: part,
    priority: "Urgent",
    approvalMode: "idle_queue_only",
    confirmedSetupNumbers: setupNumbers,
    createdAt: new Date(calculationTime).toISOString(),
    status: "Active",
  }
  const withActions = (
    priorityChange: boolean,
    actions: DeliveryMachineAction[]
  ): LegacyDashboardInput => ({
    ...source,
    plannerPriorities: priorityChange
      ? [...(source.plannerPriorities ?? []), priority]
      : source.plannerPriorities,
    planOverrides: [
      ...(source.planOverrides ?? []),
      ...actions.map((action, index) => ({
        ...action,
        target: jc,
        jobCardNumber: jc,
        status: "Active",
        createdAt: new Date(calculationTime + index).toISOString(),
      })),
    ],
  })
  type Candidate = {
    control: Row
    actions: DeliveryMachineAction[]
    priorityChange: boolean
  }
  let best: Candidate = {
    control: baseline,
    actions: [],
    priorityChange: false,
  }
  const score = (candidate: Candidate) => {
    const end = finish(candidate.control)
    const impacts = [...finishMap(candidate.control)].filter(
      ([id, row]) =>
        id !== jc &&
        row.finish &&
        row.finish > (baselineFinishes.get(id)?.finish || row.finish)
    ).length
    const setupFinishes = new Map<string, string>()
    for (const row of ownRows(candidate.control)) {
      const key = text(row.setupNo),
        value = iso(row.plannedProductionEndDate)
      if (value > (setupFinishes.get(key) ?? "")) setupFinishes.set(key, value)
    }
    const setupTime = [...setupFinishes.values()].reduce(
      (total, value) => total + Date.parse(value),
      0
    )
    return [
      end && end <= input.preferredDate ? 0 : 1,
      end || "9999",
      candidate.actions.length + Number(candidate.priorityChange),
      impacts,
      setupTime,
    ] as const
  }
  const better = (a: Candidate, b: Candidate) => {
    const left = score(a),
      right = score(b)
    // Once the date is met, prefer fewer changes, then fewer delayed jobs.
    const order =
      left[0] === 0 && right[0] === 0 ? [0, 2, 3, 1, 4] : [0, 1, 4, 2, 3]
    for (const index of order) {
      if (left[index]! < right[index]!) return true
      if (left[index]! > right[index]!) return false
    }
    return false
  }
  let trials = 0
  const trial = (
    priorityChange: boolean,
    actions: DeliveryMachineAction[]
  ): Candidate => {
    trials += 1
    return {
      control: controlOf(withActions(priorityChange, actions), calculationTime),
      priorityChange,
      actions,
    }
  }
  if (!blockers.length && finish(baseline) > input.preferredDate) {
    const urgent = trial(true, [])
    if (
      !rows(urgent.control.plannerActionConflicts).length &&
      better(urgent, best)
    )
      best = urgent
    // Compare complete multi-setup scenarios rather than solving the entire
    // factory once per individual machine. Current executing work is retained.
    const seen = new Set<string>()
    for (const machineCount of [1, 2, 3, 8]) {
      if (finish(best.control) <= input.preferredDate) break
      const actions: DeliveryMachineAction[] = []
      const plans = ownRows(baseline)
      for (const setup of setupNumbers) {
        const streams = plans.filter((row) => same(row.setupNo, setup))
        const first = streams[0]
        if (!first) continue
        const tools = Array.isArray(first.requiredToolingCodes)
          ? first.requiredToolingCodes.map(text)
          : requiredToolingCodes(first)
        const busyUntil = (machine: Row) =>
          rows(baseline.machinePlanDetailRows)
            .filter(
              (row) =>
                same(row.machine, machine.machineNo ?? machine.machine) &&
                active(row)
            )
            .map((row) => iso(row.plannedProductionEndDate))
            .sort()
            .at(-1) ?? ""
        const compatible = rows(baseline.machinePlanningRows)
          .filter(
            (machine) =>
              (!machine.status ||
                ["active", "yes", "true", "available", "running"].includes(
                  text(machine.status).toLowerCase()
                )) &&
              machineFamilyMatches(
                first.routeMachine,
                machineMasterFamily(machine)
              ) &&
              (!first.machineType ||
                !machine.machineType ||
                same(first.machineType, machine.machineType))
          )
          .filter(
            (machine) =>
              !streams.some((row) =>
                same(row.machine, machine.machineNo ?? machine.machine)
              )
          )
          .sort(
            (a, b) =>
              busyUntil(a).localeCompare(busyUntil(b)) ||
              text(a.machineNo ?? a.machine).localeCompare(
                text(b.machineNo ?? b.machine)
              )
          )
        const toolingLimit = Math.min(
          ...tools.map(
            (code) =>
              Number(
                rows(baseline.toolingAvailabilityRows).find((stock) =>
                  same(stock.assetCode, code)
                )?.allocatedQuantity
              ) || 0
          )
        )
        const move = machineCount === 1
        if (move && (streams.length !== 1 || streams.some(locked))) continue
        const selected = compatible.slice(
          0,
          move
            ? 1
            : Math.max(
                0,
                Math.min(
                  machineCount,
                  toolingLimit,
                  streams.length + compatible.length
                ) - streams.length
              )
        )
        for (const machine of selected) {
          const target = text(machine.machineNo ?? machine.machine)
          if (!target || streams.some((row) => same(row.machine, target)))
            continue
          const before = rows(baseline.machinePlanDetailRows).filter(
            (row) => same(row.machine, target) && locked(row)
          )
          const placement = {
            targetJobCardNumber: jc,
            targetSetupNumber: Number(setup),
            targetMachineNumber: target,
            targetSourceMachineNumber: "",
            queueBeforeSetups: before.map((row) => ({
              jobCardNumber: text(row.jcNo),
              setupNumber: Number(row.setupNo),
              machineNumber: target,
            })),
          }
          const mode = move ? "move" : "add_parallel_machine"
          const action: DeliveryMachineAction = {
            assignmentMode: mode,
            setupNumber: Number(setup),
            fromMachineNumber: mode === "move" ? text(first.machine) : "",
            toMachineNumber: target,
            queuePlacements: [
              {
                ...placement,
                targetSourceMachineNumber:
                  mode === "move" ? text(first.machine) : "",
              },
            ],
          }
          actions.push(action)
        }
      }
      const signature = JSON.stringify(actions)
      if (!actions.length || seen.has(signature)) continue
      seen.add(signature)
      const candidate = trial(true, actions)
      const candidatePlans = rows(candidate.control.machinePlanDetailRows)
      const candidateFinishes = finishMap(candidate.control)
      // Reject ignored overrides, vanished forecasts and displaced executing work.
      if (
        actions.some(
          (action) =>
            !ownRows(candidate.control).some(
              (row) =>
                same(row.setupNo, action.setupNumber) &&
                same(row.machine, action.toMachineNumber)
            )
        ) ||
        rows(candidate.control.plannerActionConflicts).length ||
        [...baselineFinishes].some(
          ([id, row]) => row.finish && !candidateFinishes.get(id)?.finish
        ) ||
        rows(baseline.machinePlanDetailRows)
          .filter(locked)
          .some(
            (row) =>
              !candidatePlans.some(
                (nextRow) =>
                  same(nextRow.jcNo, row.jcNo) &&
                  same(nextRow.setupNo, row.setupNo) &&
                  same(nextRow.machine, row.machine) &&
                  Number(nextRow.rawActualQty) === Number(row.rawActualQty)
              )
          )
      )
        continue
      if (better(candidate, best)) best = candidate
    }
  }
  const proposedFinish = finish(best.control)
  const plan: UrgentDeliveryPlan = {
    fingerprint: "",
    jobCardNumber: jc,
    partCode: part,
    preferredDate: input.preferredDate,
    currentFinish: finish(baseline),
    proposedFinish,
    remainingQuantity,
    meetsDate:
      !blockers.length &&
      !!proposedFinish &&
      proposedFinish <= input.preferredDate,
    priorityChange: best.priorityChange,
    actions: best.actions,
    machines: ownRows(best.control).map((row) => ({
      setup: text(row.setupNo),
      machine: text(row.machine),
      remaining: Math.max(0, Number(row.pendingGoodQty) || 0),
      start: iso(row.plannedProductionStartDate),
      finish: iso(row.plannedProductionEndDate),
    })),
    impacts: [...finishMap(best.control)].flatMap(([id, row]) => {
      const current = baselineFinishes.get(id)?.finish
      return id !== jc && current && row.finish !== current
        ? [
            {
              jobCardNumber: id,
              partCode: row.partCode,
              currentFinish: current,
              proposedFinish: row.finish,
            },
          ]
        : []
    }),
    blockers,
    notes: [
      "Full remaining quantity; machining finish only. Dispatch, inspection and packing need separate allowance.",
      "Running and prepared setups stay on their machines. New assignments wait for their current work to finish.",
      "Downstream work follows recorded WIP gates. Setup dates remain conditional on material, tooling and production progress.",
      `Compared ${trials + 1} possible plans, using up to eight machines per setup. Other arrangements may finish earlier.`,
    ],
  }
  // Source facts + production day bind approval to the reviewed workload. No
  // client-supplied machine actions are accepted by the application endpoint.
  plan.fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        source,
        input,
        today,
        actions: plan.actions,
        priorityChange: plan.priorityChange,
        machines: plan.machines,
        currentFinish: plan.currentFinish,
        proposedFinish,
        impacts: plan.impacts,
        blockers,
      })
    )
    .digest("hex")
  return plan
}
