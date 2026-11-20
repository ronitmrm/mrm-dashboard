import { createDashboardPlanningRepository } from "./dashboard-planning"
import {
  companyWideMasterEntryTypes,
  readCanonicalPlanningInputs,
} from "./dashboard-read-model"
import {
  repositoryPool,
  withRepositoryTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import { normalizeProductionFloorCode } from "./production-floors"
import {
  simulateUrgentDelivery,
  type UrgentDeliveryInput,
} from "./urgent-delivery"

export function createUrgentDeliveryRepository(options: RepositoryPoolOptions) {
  const { close } = repositoryPool(options)
  return {
    close,
    async run(
      input: UrgentDeliveryInput & {
        organizationId: string
        productionFloorCode: string
        actorUserId: string
        action: "simulate" | "apply"
        fingerprint?: string
      }
    ) {
      return withRepositoryTransaction(options, async () => {
        const { pool: client } = repositoryPool(options)
        await client.query(
          input.action === "apply"
            ? "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"
            : "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
        )
        const floor = normalizeProductionFloorCode(input.productionFloorCode)
        if (input.action === "apply") {
          // Serialize approvals of this job; all actions below share this transaction.
          await client.query(
            `SELECT id FROM manufacturing.work_orders
            WHERE organization_id = $1 AND lower(job_card_number) = lower($2) FOR UPDATE`,
            [input.organizationId, input.jobCardNumber]
          )
          const duplicate = await client.query(
            `SELECT id FROM manufacturing.planner_priority_events
            WHERE organization_id = $1 AND source_payload->>'urgentDeliveryFingerprint' = $2
            AND reversed_at IS NULL LIMIT 1`,
            [input.organizationId, input.fingerprint ?? ""]
          )
          if (duplicate.rows.length)
            throw new Error(
              "This plan was already applied. Refresh the production plan."
            )
        }
        const prepared = await readCanonicalPlanningInputs(client, {
          organizationId: input.organizationId,
          productionFloorCode: floor,
        })
        const coverage = prepared.source.sourceCoverageByFloor[floor]
        if (
          !coverage ||
          Object.values(coverage).some((group) => group.truncated) ||
          Object.values(prepared.source.sourceCoverageByFloor).some(
            (other) =>
              other.corrections.truncated ||
              Object.entries(other.dataEntries.groups).some(
                ([category, group]) =>
                  companyWideMasterEntryTypes.has(category) && group.truncated
              )
          )
        )
          throw new Error(
            "Production workload is incomplete. Refresh with complete data before simulating."
          )
        const source = prepared.preparedFloors.get(floor)!.input
        const plan = simulateUrgentDelivery(source, {
          jobCardNumber: input.jobCardNumber,
          preferredDate: input.preferredDate,
        })
        if (input.action === "simulate") return { plan, applied: false }
        if (!input.fingerprint || input.fingerprint !== plan.fingerprint)
          throw new Error(
            "Production status or planning changed. Simulate and review the plan again."
          )
        if (
          plan.blockers.length ||
          !plan.proposedFinish ||
          (!plan.priorityChange && !plan.actions.length)
        )
          throw new Error("There are no approved planning changes to apply.")
        const repository = createDashboardPlanningRepository(options)
        try {
          const reason = `Urgent delivery simulation: ${plan.jobCardNumber}; requested ${plan.preferredDate}; estimated ${plan.proposedFinish}`
          if (plan.priorityChange) {
            const saved = await repository.recordPlannerPriority({
              organizationId: input.organizationId,
              actorUserId: input.actorUserId,
              productionFloorCode: floor,
              jobCardNumber: plan.jobCardNumber,
              partCode: plan.partCode,
              priority: "Urgent",
              approvalMode: "idle_queue_only",
              confirmedSetupNumbers: [
                ...new Set(plan.machines.map((row) => row.setup)),
              ],
              remark: reason,
            })
            await client.query(
              `UPDATE manufacturing.planner_priority_events
              SET source_payload = source_payload || $2::jsonb WHERE id = $1`,
              [
                saved.id,
                JSON.stringify({
                  urgentDeliveryFingerprint: plan.fingerprint,
                  urgentDeliveryPlan: plan,
                }),
              ]
            )
          }
          for (const action of plan.actions) {
            await repository.recordPlanOverride({
              ...action,
              organizationId: input.organizationId,
              actorUserId: input.actorUserId,
              productionFloorCode: floor,
              jobCardNumber: plan.jobCardNumber,
              reason,
              ...(action.assignmentMode === "add_parallel_machine" ? { parallelWipDecision: "queue" as const } : {}),
            })
          }
          return { plan, applied: true }
        } finally {
          await repository.close()
        }
      })
    },
  }
}
