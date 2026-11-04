import { createHash } from "node:crypto"
import type { PoolClient } from "pg"
import type {
  InterruptedSetupInput,
  QueuePlacementInput,
} from "./dashboard-planning"
import { companyWideMasterEntryTypes, readCanonicalPlanningInputs } from "./dashboard-read-model"
import {
  buildLegacyDashboardSnapshotWithPlanning,
  type LegacyDashboardInput,
} from "./legacy-dashboard-analysis"
import { normalizeProductionFloorCode } from "./production-floors"

export type ParallelMachineCandidate = {
  jobCardNumber: string
  setupNumber: number
  toMachineNumber: string
  queuePlacements?: QueuePlacementInput[]
  interruptedSetups?: InterruptedSetupInput[]
}
export type ParallelMachineReview = {
  fingerprint: string
  ready: boolean
  blocker: string
  plannedStart: string
  plannedFinish: string
  availableWip: number | null
  requiredWip: number | null
  bufferDays: number | null
  machineCount: number
  earlyStartAllowed: boolean
  earlyStartBlocker: string
  earlyPlannedStart?: string
  earlyPlannedFinish?: string
}
export type ParallelWipDecision = "queue" | "start_early"

const text = (value: unknown) => String(value ?? "").trim()
const same = (a: unknown, b: unknown) =>
  text(a).toLowerCase() === text(b).toLowerCase()

export function calculateParallelMachineReview(
  source: LegacyDashboardInput,
  candidate: ParallelMachineCandidate,
  now = Date.now()
): ParallelMachineReview {
  if (!candidate.jobCardNumber.trim() || !candidate.toMachineNumber.trim() || !Number.isInteger(candidate.setupNumber) || candidate.setupNumber <= 0)
    throw new Error("Select a Job Card, setup and compatible machine before calculating.")
  const work = source.dataEntries?.find(
    (entry) =>
      entry.entryType === "work_order" &&
      typeof entry.payload === "object" &&
      entry.payload !== null &&
      same(
        (entry.payload as Record<string, unknown>).jcNo,
        candidate.jobCardNumber
      )
  )
  if (!work)
    throw new Error(
      "Job Card is not in the current production plan. Refresh and review again."
    )
  const action = {
    ...candidate,
    target: candidate.jobCardNumber,
    setupNo: String(candidate.setupNumber),
    toMachine: candidate.toMachineNumber,
    assignmentMode: "add_parallel_machine",
    createdAt: new Date(now).toISOString(),
  }
  function solve(allowEarlyWipStart: boolean) {
    const result = buildLegacyDashboardSnapshotWithPlanning(
      {
        ...source,
        planOverrides: [
          ...(source.planOverrides ?? []),
          { ...action, allowEarlyWipStart },
        ],
      },
      { calculationTime: now, forceFullCalculation: true }
    ).snapshot.productionControl
    return result.machinePlanDetailRows.find(
      (row) =>
        same(row.jcNo, candidate.jobCardNumber) &&
        same(row.setupNo, candidate.setupNumber) &&
        same(row.machine, candidate.toMachineNumber)
    )
  }
  const row = solve(false)
  if (!row)
    throw new Error(
      "The added machine cannot be planned. Check route compatibility, WIP, tooling and current assignments."
    )
  const wip = row.wipReadiness as
    | {
        availableQty: number
        requiredQty: number
        bufferDays: number
        ready: boolean
      }
    | undefined
  const early =
    wip && !wip.ready && Number(row.physicalWipQty) > 0
      ? solve(true)
      : undefined
  const wipBlocker =
    wip && !wip.ready
      ? `Available WIP: ${Math.floor(wip.availableQty).toLocaleString("en-IN")} pcs; required for ${row.parallelMachineCount} machines: ${Math.ceil(wip.requiredQty).toLocaleString("en-IN")} pcs (${wip.bufferDays}-day buffer); short by ${Math.ceil(Math.max(0, wip.requiredQty - wip.availableQty)).toLocaleString("en-IN")} pcs.`
      : ""
  return {
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          source,
          candidate,
          date: new Date(now).toISOString().slice(0, 10),
        })
      )
      .digest("hex"),
    ready: row.shopFloorTaskReady === true,
    blocker: [wipBlocker, text(row.shopFloorTaskBlocker)]
      .filter(Boolean)
      .join(" "),
    plannedStart: text(row.setupPlannedDate),
    plannedFinish: text(row.plannedProductionEndDate),
    availableWip: wip?.availableQty ?? null,
    requiredWip: wip?.requiredQty ?? null,
    bufferDays: wip?.bufferDays ?? null,
    machineCount: Number(row.parallelMachineCount) || 1,
    earlyStartAllowed: early?.shopFloorTaskReady === true,
    earlyStartBlocker: early
      ? text(early.shopFloorTaskBlocker)
      : wip && !wip.ready
        ? "An early start requires recorded WIP and an available machine with no other blockers."
        : "Early WIP approval does not override machine, tooling or planned-date blockers.",
    earlyPlannedStart: text(early?.setupPlannedDate),
    earlyPlannedFinish: text(early?.plannedProductionEndDate),
  }
}

export async function readParallelMachineReview(
  client: Pick<PoolClient, "query">,
  context: { organizationId: string; productionFloorCode?: string },
  candidate: ParallelMachineCandidate
) {
  const floor = normalizeProductionFloorCode(context.productionFloorCode)
  const prepared = await readCanonicalPlanningInputs(client, {
    organizationId: context.organizationId,
    productionFloorCode: floor,
  })
  const coverage = prepared.source.sourceCoverageByFloor[floor]
  if (!coverage || Object.values(coverage).some((group) => group.truncated) ||
    Object.values(prepared.source.sourceCoverageByFloor).some(other => other.corrections.truncated ||
      Object.entries(other.dataEntries.groups).some(([category, group]) => companyWideMasterEntryTypes.has(category) && group.truncated)))
    throw new Error(
      "Production workload is incomplete. Refresh with complete data before reviewing a parallel machine."
    )
  return calculateParallelMachineReview(
    prepared.preparedFloors.get(floor)!.input,
    candidate
  )
}

export function validateParallelMachineReview(
  review: ParallelMachineReview,
  decision?: ParallelWipDecision,
  fingerprint?: string
) {
  if (fingerprint && fingerprint !== review.fingerprint)
    throw new Error(
      "Production or queue details changed. Calculate and review the parallel plan again."
    )
  if (decision === "start_early" && !review.earlyStartAllowed)
    throw new Error(
      review.earlyStartBlocker ||
        review.blocker ||
        "Early start is unavailable."
    )
  if (!review.ready && !decision)
    throw new Error(
      `${review.blocker} Choose Queue for calculated start or explicitly approve an early start.`
    )
}
