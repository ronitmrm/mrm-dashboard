import type { PoolClient } from "pg"
import { readRequiredRawMaterialKg } from "./job-card-workspace"
import { productionFloorCodeForRecord } from "./production-floors"

export async function readJobCardMaterialBalances(
  client: Pick<PoolClient, "query">,
  organizationId: string,
  floor?: string,
  workOrderId?: string
) {
  const result = await client.query<{
    id: string; jobCardNumber: string; partCode: string
    receivedKg: string; rejectedKg: string
    sourcePayload: Record<string, unknown>; rowVersion: string
    acceptanceRecorded: boolean
  }>(`SELECT work_order.id, work_order.job_card_number AS "jobCardNumber",
      item.uid AS "partCode", work_order.source_payload AS "sourcePayload",
      work_order.row_version::text AS "rowVersion",
      EXISTS (SELECT 1 FROM audit.events event WHERE event.target_id = work_order.id
        AND event.organization_id = $1 AND event.event_type = 'production.rm_short.accepted'
        AND event.after_state = work_order.source_payload->'rmShortAcceptance') AS "acceptanceRecorded",
      COALESCE((SELECT sum(quantity_kg) FROM manufacturing.raw_material_receipts
        WHERE organization_id = $1 AND lower(job_card_number) = lower(work_order.job_card_number)
          AND reversed_at IS NULL), 0)::text AS "receivedKg",
      COALESCE((SELECT sum(rejected_kg) FROM manufacturing.raw_material_rejection_events
        WHERE work_order_id = work_order.id), 0)::text AS "rejectedKg"
    FROM manufacturing.work_orders work_order
    JOIN catalog.items item ON item.id = work_order.item_id
    WHERE work_order.organization_id = $1 AND work_order.status <> 'Cancelled'
      AND ($2::uuid IS NULL OR work_order.id = $2)
    ORDER BY work_order.job_card_number`, [organizationId, workOrderId ?? null])
  return result.rows.filter(row => !floor || productionFloorCodeForRecord(row) === floor).map(row => {
    const requiredKg = readRequiredRawMaterialKg(row.sourcePayload?.requiredRmKg)
    const receivedKg = Number(row.receivedKg)
    const rejectedKg = Number(row.rejectedKg)
    const usableKg = Math.max(receivedKg - rejectedKg, 0)
    const pendingKg = requiredKg === null ? null : Math.max(requiredKg - usableKg, 0)
    const receiptSufficient = requiredKg !== null && usableKg + 0.000001 >= requiredKg * 0.95
    const acceptance = row.sourcePayload?.rmShortAcceptance
    const accepted = typeof acceptance === "object" && acceptance !== null && !Array.isArray(acceptance)
      ? acceptance as Record<string, unknown> : null
    const shortAccepted = row.acceptanceRecorded && accepted !== null && requiredKg !== null
      && Number(accepted.requiredKg) === requiredKg && usableKg >= Number(accepted.usableKg)
    return { id: row.id, jobCardNumber: row.jobCardNumber, partCode: row.partCode, isRework: row.sourcePayload?.isRework === true,
      rowVersion: Number(row.rowVersion), requiredKg, receivedKg, rejectedKg, usableKg,
      pendingKg, receiptSufficient, shortAccepted, acceptance: shortAccepted ? accepted : null }
  })
}

export function materialWaitPending(status: Record<string, unknown>, receivedKg: number, upstreamGood: number) {
  const value = status.awaitingMaterial
  if (status.stage !== "planned" || !value || typeof value !== "object" || Array.isArray(value)) return false
  const wait = value as Record<string, unknown>
  return wait.kind === "rm" ? receivedKg <= Number(wait.availableAtRelease)
    : wait.kind === "wip" && upstreamGood <= Number(wait.availableAtRelease)
}
