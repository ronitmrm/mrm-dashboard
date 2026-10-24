import type { PoolClient } from "pg"
import { productionFloorCodeForRecord } from "./production-floors"

type QueryClient = Pick<PoolClient, "query">

export async function readJobCardRevisions(client: QueryClient, input: {
  organizationId: string; jobCardNumber: string; productionFloorCode: string
}) {
  const result = await client.query<{
    id: string; jobCardNumber: string; rootJobCardNumber: string; quantity: string
    sourcePayload: Record<string, unknown>; status: string; receivedKg: string
    dispatchedQuantity: string; routeSelected: boolean; firstSessionAt: string | null; latestSessionAt: string | null
  }>(`WITH requested AS (
      SELECT COALESCE(source_payload->>'revisionRootWorkOrderId', id::text) AS root_id
      FROM manufacturing.work_orders WHERE organization_id = $1 AND lower(job_card_number) = lower($2)
    ) SELECT work_order.id, work_order.job_card_number AS "jobCardNumber",
      root.job_card_number AS "rootJobCardNumber", work_order.ordered_quantity::text AS quantity,
      COALESCE(work_order.source_payload, '{}'::jsonb) AS "sourcePayload", work_order.status,
      COALESCE((SELECT sum(quantity_kg) FROM manufacturing.raw_material_receipts receipt
        WHERE receipt.organization_id = $1 AND lower(receipt.job_card_number) = lower(work_order.job_card_number)
          AND receipt.reversed_at IS NULL), 0)::text AS "receivedKg",
      COALESCE((SELECT sum(quantity) FROM manufacturing.dispatch_approval_events dispatch
        WHERE dispatch.work_order_id = work_order.id AND dispatch.decision = 'approved'
          AND dispatch.reversed_at IS NULL), 0)::text AS "dispatchedQuantity",
      EXISTS (SELECT 1 FROM manufacturing.route_selections selection
        WHERE selection.work_order_id = work_order.id AND selection.reversed_at IS NULL) AS "routeSelected",
      (SELECT min(started_at)::text FROM manufacturing.production_sessions session
        WHERE session.work_order_id = work_order.id AND session.reversed_at IS NULL) AS "firstSessionAt",
      (SELECT max(COALESCE(ended_at, started_at))::text FROM manufacturing.production_sessions session
        WHERE session.work_order_id = work_order.id AND session.reversed_at IS NULL) AS "latestSessionAt"
    FROM requested
    JOIN manufacturing.work_orders root ON root.id::text = requested.root_id AND root.organization_id = $1
    JOIN manufacturing.work_orders work_order ON work_order.organization_id = $1
      AND (work_order.id = root.id OR work_order.source_payload->>'revisionRootWorkOrderId' = root.id::text)
    ORDER BY COALESCE((work_order.source_payload->>'revisionNumber')::integer, 0), work_order.job_card_number`,
  [input.organizationId, input.jobCardNumber])
  return result.rows.filter(row => productionFloorCodeForRecord(row) === input.productionFloorCode).map(row => {
    const revisionNumber = Number(row.sourcePayload.revisionNumber ?? 0)
    const disposition = String(row.sourcePayload.disposition ?? "original")
    const revisionLabel = revisionNumber === 0 ? "Original" : `Rev ${revisionNumber} · ${disposition === "replacement" ? "Replacement" : "Rework"}`
    const requiredKg = Number(row.sourcePayload.requiredRmKg ?? 0)
    const status = row.status === "Rejected" ? "Rejected — Remake Required" : row.status === "Cancelled" ? "Cancelled"
      : disposition === "replacement" && Number(row.receivedKg) < requiredKg * 0.95 ? "Awaiting new RM"
      : Number(row.dispatchedQuantity) > 0 ? `${Number(row.dispatchedQuantity)} pcs dispatched`
      : row.firstSessionAt ? "In production"
      : revisionNumber > 0 && !row.routeSelected ? "Route selection required" : "Ready for planning"
    return { ...row, revisionNumber, disposition, revisionLabel, status,
      reason: String(row.sourcePayload.reason ?? "Original production"),
      receivedOn: String(row.sourcePayload.receivedOn ?? ""), quantity: Number(row.quantity) }
  })
}

export async function readJobCardRevisionHistory(client: QueryClient, organizationId: string,
  floor: string, revisions: Awaited<ReturnType<typeof readJobCardRevisions>>) {
  const result = await client.query<Record<string, unknown> & { revisionReference: string }>(`
    SELECT log.job_card_number AS "revisionReference", log.event_time AS "eventTime",
      log.event_type AS "eventType", log.setup_number AS "setupNumber", log.machine_number AS "machineNumber",
      log.entered_by_name AS "enteredByName", log.entered_role AS "enteredRole",
      concat_ws(' · ', log.session_reference, log.reason_name) AS detail,
      log.quantity, log.duration_minutes AS "durationMinutes"
    FROM reporting.production_event_log log WHERE log.organization_id = $1
      AND log.production_floor_code = $2 AND log.job_card_number = ANY($3::text[])
    UNION ALL
    SELECT work_order.job_card_number, entry.recorded_at, 'production_entry',
      setup.setup_number::text, machine.machine_number, actor.name, NULL,
      entry.quantity_rejected::text || ' rejected', entry.quantity_good, NULL
    FROM manufacturing.production_entries entry
    JOIN manufacturing.work_orders work_order ON work_order.id = entry.work_order_id
    LEFT JOIN manufacturing.operation_setups setup ON setup.id = entry.operation_setup_id
    LEFT JOIN catalog.machines machine ON machine.id = entry.machine_id
    LEFT JOIN identity.users actor ON actor.id = entry.recorded_by_user_id
    WHERE entry.organization_id = $1 AND entry.work_order_id = ANY($4::uuid[])
      AND entry.reversed_at IS NULL AND NOT EXISTS (SELECT 1 FROM manufacturing.production_sessions session
        WHERE session.production_entry_id = entry.id AND session.reversed_at IS NULL)
    UNION ALL
    SELECT work_order.job_card_number, inspection.inspected_at, 'first_piece_inspection',
      setup.setup_number::text, machine.machine_number, inspector.name, NULL,
      concat_ws(' · ', inspection.check_key, inspection.status), NULL, NULL
    FROM quality.first_piece_inspections inspection
    JOIN manufacturing.work_orders work_order ON work_order.id = inspection.work_order_id
    JOIN manufacturing.operation_setups setup ON setup.id = inspection.operation_setup_id
    LEFT JOIN catalog.machines machine ON machine.id = inspection.machine_id
    LEFT JOIN identity.users inspector ON inspector.id = inspection.inspector_user_id
    WHERE inspection.organization_id = $1 AND inspection.work_order_id = ANY($4::uuid[]) AND inspection.reversed_at IS NULL
    UNION ALL
    SELECT work_order.job_card_number, check_row.checked_at, 'in_process_inspection',
      setup.setup_number::text, machine.machine_number, checker.name, NULL,
      concat_ws(' · ', check_row.check_key, check_row.status), NULL, NULL
    FROM quality.hourly_checks check_row
    JOIN manufacturing.work_orders work_order ON work_order.id = check_row.work_order_id
    JOIN manufacturing.operation_setups setup ON setup.id = check_row.operation_setup_id
    LEFT JOIN catalog.machines machine ON machine.id = check_row.machine_id
    LEFT JOIN identity.users checker ON checker.id = check_row.checker_user_id
    WHERE check_row.organization_id = $1 AND check_row.work_order_id = ANY($4::uuid[]) AND check_row.reversed_at IS NULL
    UNION ALL
    SELECT receipt.job_card_number, receipt.created_at, 'raw_material_received', NULL, NULL, NULL, NULL,
      concat_ws(' · ', receipt.receipt_number, receipt.quantity_kg::text || ' kg'), NULL, NULL
    FROM manufacturing.raw_material_receipts receipt WHERE receipt.organization_id = $1
      AND receipt.job_card_number = ANY($3::text[]) AND receipt.reversed_at IS NULL
    UNION ALL
    SELECT work_order.job_card_number, dispatch.occurred_at, 'dispatch', NULL, NULL, actor.name, NULL,
      dispatch.reason, dispatch.quantity, NULL
    FROM manufacturing.dispatch_approval_events dispatch
    JOIN manufacturing.work_orders work_order ON work_order.id = dispatch.work_order_id
    LEFT JOIN identity.users actor ON actor.id = dispatch.actor_user_id
    WHERE dispatch.organization_id = $1 AND dispatch.work_order_id = ANY($4::uuid[])
      AND dispatch.decision = 'approved' AND dispatch.reversed_at IS NULL
    ORDER BY "eventTime" DESC`, [organizationId, floor, revisions.map(row => row.jobCardNumber), revisions.map(row => row.id)])
  const labels = new Map(revisions.map(row => [row.jobCardNumber, row.revisionLabel]))
  const history: Record<string, unknown>[] = [
    ...result.rows.map(row => ({ ...row, revisionLabel: labels.get(row.revisionReference) ?? "Original" })),
    ...revisions.filter(row => row.revisionNumber > 0).map(row => ({
      revisionReference: row.jobCardNumber, revisionLabel: row.revisionLabel,
      eventType: row.sourcePayload.receiptType === "fg_rejected" ? "fg_rejected"
        : row.sourcePayload.createdFromReworkRejection === true ? "replacement_created" : "return_received", eventTime: row.sourcePayload.receivedAt,
      detail: [row.sourcePayload.receiptReference, row.reason].filter(Boolean).join(" · "), quantity: row.quantity,
    })),
    ...revisions.filter(row => row.sourcePayload.reworkRejectedAt && row.sourcePayload.createdFromReworkRejection !== true).map(row => ({
      revisionReference: row.jobCardNumber, revisionLabel: row.revisionLabel,
      eventType: "rework_rejected", eventTime: row.sourcePayload.reworkRejectedAt,
      detail: [row.sourcePayload.receiptReference, row.sourcePayload.reworkRejectionReason, row.sourcePayload.replacementJobCardNumber].filter(Boolean).join(" · "),
      quantity: row.sourcePayload.reworkRejectedQuantity,
    })),
  ]
  return history.sort((left, right) => new Date(String(right.eventTime)).getTime() - new Date(String(left.eventTime)).getTime())
}
