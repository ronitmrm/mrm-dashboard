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

export async function readMaterialFlowReviews(
  client: Pick<PoolClient, "query">,
  organizationId: string,
  floor: string
) {
  const result = await client.query<{
    id: string; jobCardNumber: string; partCode: string; optionNumber: string
    setupNumber: number; machineNumber: string; upstreamSetupNumber: number
    upstreamGoodPieces: string; setupProcessedPieces: string; sessionId: string | null
    sourcePayload: Record<string, unknown>
  }>(`SELECT state.id, work_order.job_card_number AS "jobCardNumber", item.uid AS "partCode",
      route.route_code AS "optionNumber", setup.setup_number AS "setupNumber",
      machine.machine_number AS "machineNumber", previous.setup_number AS "upstreamSetupNumber",
      COALESCE((SELECT sum(quantity_good) FROM manufacturing.production_entries
        WHERE work_order_id = work_order.id AND operation_setup_id = previous.id
          AND reversed_at IS NULL), 0)::text AS "upstreamGoodPieces",
      COALESCE((SELECT sum(quantity_good + quantity_rejected) FROM manufacturing.production_entries
        WHERE work_order_id = work_order.id AND operation_setup_id = setup.id
          AND reversed_at IS NULL), 0)::text AS "setupProcessedPieces",
      (SELECT id FROM manufacturing.production_sessions
        WHERE work_order_id = work_order.id AND operation_setup_id = setup.id
          AND machine_id = state.machine_id AND status = 'closed' AND reversed_at IS NULL
        ORDER BY ended_at DESC, created_at DESC LIMIT 1) AS "sessionId",
      state.source_payload || jsonb_build_object('stage', state.stage) AS "sourcePayload"
    FROM manufacturing.shop_floor_setup_state state
    JOIN manufacturing.work_orders work_order ON work_order.id = state.work_order_id
    JOIN catalog.items item ON item.id = work_order.item_id
    JOIN manufacturing.route_options route ON route.id = state.route_option_id
    JOIN manufacturing.operation_setups setup ON setup.id = state.operation_setup_id
    JOIN catalog.machines machine ON machine.id = state.machine_id
    JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
    JOIN LATERAL (
      SELECT id, setup_number FROM manufacturing.operation_setups
      WHERE route_option_id = setup.route_option_id AND active AND sequence < setup.sequence
      ORDER BY sequence DESC LIMIT 1
    ) previous ON true
    JOIN LATERAL (
      SELECT bool_and(stage = 'item_complete' AND NOT active) AS complete
      FROM manufacturing.shop_floor_setup_state
      WHERE work_order_id = work_order.id AND operation_setup_id = previous.id
    ) upstream ON upstream.complete
    LEFT JOIN LATERAL (
      SELECT to_route_option_id FROM manufacturing.route_change_events
      WHERE work_order_id = work_order.id AND reversed_at IS NULL
      ORDER BY occurred_at DESC, id DESC LIMIT 1
    ) route_change ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(btrim(work_order.source_payload->>'OPTION NUMBER'), ''),
        NULLIF(btrim(work_order.source_payload->>'optionNumber'), '')) AS route_code
    ) imported ON true
    WHERE state.organization_id = $1 AND floor.code = $2 AND setup.active
      AND state.stage = 'planned' AND NOT state.active
      AND state.source_payload #>> '{awaitingMaterial,kind}' = 'wip'
      AND work_order.status NOT IN ('Cancelled', 'Rejected')
      AND route.id = COALESCE(route_change.to_route_option_id,
        CASE WHEN imported.route_code IS NOT NULL THEN (
          SELECT current_route.id FROM manufacturing.route_options current_route
          WHERE current_route.organization_id = $1 AND current_route.item_id = work_order.item_id
            AND current_route.production_floor_id = floor.id AND current_route.active
            AND current_route.work_order_id IS NULL
            AND (lower(current_route.route_code) = lower(imported.route_code)
              OR lower(COALESCE(current_route.legacy_option_number, '')) = lower(imported.route_code))
          ORDER BY current_route.revision DESC LIMIT 1
        ) ELSE COALESCE((
          SELECT route_option_id FROM manufacturing.route_selections
          WHERE work_order_id = work_order.id AND reversed_at IS NULL
          ORDER BY selected_at DESC, id DESC LIMIT 1
        ), (
          SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END
          FROM manufacturing.route_options
          WHERE organization_id = $1 AND item_id = work_order.item_id
            AND production_floor_id = floor.id AND active AND work_order_id IS NULL
            AND COALESCE(work_order.source_payload->>'isRevision', 'false') <> 'true'
        )) END)
    ORDER BY work_order.job_card_number, setup.sequence, machine.machine_number`, [organizationId, floor])
  return result.rows.flatMap(({ sourcePayload, upstreamGoodPieces, setupProcessedPieces, ...review }) =>
    materialWaitPending(sourcePayload, 0, Number(upstreamGoodPieces))
      ? [{ ...review, upstreamGoodPieces: Number(upstreamGoodPieces), setupProcessedPieces: Number(setupProcessedPieces) }]
      : [])
}
