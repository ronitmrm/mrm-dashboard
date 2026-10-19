import { randomUUID } from "node:crypto"
import type { PoolClient } from "pg"
import { productionFloorCodeForRecord, type ProductionFloorCode } from "./production-floors"
import { machineTypeForFamily } from "./planning-rules"
import { ShopFloorConflictError } from "./production-shop-floor"
import { requiredToolingCodes } from "./tooling-availability"

export type ReworkRouteSetup = {
  setupName: string
  machineFamily: string
  cycleTimeSeconds: number
  setupTimeMinutes: number
  stageWeight: number
  operationWeight?: number
  fixture?: string
  tooling?: string
  foamTool?: string
  inspectionChecks: string[]
}
type ReworkContext = {
  organizationId: string
  productionFloorCode: ProductionFloorCode
  jobCardNumber: string
  actorUserId?: string | null
}

async function reworkActivity(client: PoolClient, input: ReworkContext) {
  const result = await client.query<{
    id: string; item_id: string; ordered_quantity: string; work_order_number: string
    source_payload: Record<string, unknown>; status: string; part_code: string
  }>(`SELECT work_order.id, item_id, ordered_quantity::text, work_order_number,
       COALESCE(work_order.source_payload, '{}'::jsonb) AS source_payload, work_order.status, item.uid AS part_code
     FROM manufacturing.work_orders work_order JOIN catalog.items item ON item.id = item_id
     WHERE work_order.organization_id = $1 AND lower(job_card_number) = lower($2)
     FOR UPDATE OF work_order`, [input.organizationId, input.jobCardNumber.trim()])
  const row = result.rows[0]
  if (!row || productionFloorCodeForRecord({ sourcePayload: row.source_payload }) !== input.productionFloorCode
    || row.source_payload.isRework !== true || row.source_payload.isRevision !== true) {
    throw new ShopFloorConflictError("Select a Rework activity in this Production Unit.")
  }
  if (["Cancelled", "Rejected"].includes(row.status)) throw new ShopFloorConflictError("This rework activity is already closed.")
  return row
}

export async function createJobReworkRoute(client: PoolClient, input: ReworkContext & { setups: ReworkRouteSetup[] }) {
  const order = await reworkActivity(client, input)
  if (!input.setups.length || input.setups.length > 20) throw new ShopFloorConflictError("Enter between 1 and 20 rework setups.")
  const used = await client.query<{ used: boolean }>(`SELECT
    EXISTS (SELECT 1 FROM manufacturing.production_sessions WHERE work_order_id = $1 AND reversed_at IS NULL)
    OR EXISTS (SELECT 1 FROM manufacturing.production_entries WHERE work_order_id = $1 AND reversed_at IS NULL)
    OR EXISTS (SELECT 1 FROM manufacturing.shop_floor_setup_state WHERE work_order_id = $1 AND active AND stage <> 'planned') AS used`, [order.id])
  if (used.rows[0]!.used) throw new ShopFloorConflictError("The rework route cannot be replaced after execution starts. Its history must be preserved.")
  const floor = await client.query<{ id: string }>("SELECT id FROM manufacturing.production_floors WHERE organization_id = $1 AND code = $2", [input.organizationId, input.productionFloorCode])
  if (!floor.rows[0]) throw new ShopFloorConflictError("Production Unit was not found.")
  const routeId = randomUUID()
  const routeCode = `RW-${routeId}`
  const shared = { reworkJobCardNumber: input.jobCardNumber.trim(), productionFloorCode: input.productionFloorCode,
    partNo: order.part_code, partCode: order.part_code, optionNumber: routeCode }
  await client.query(`INSERT INTO manufacturing.route_options (id, organization_id, item_id, production_floor_id,
    work_order_id, route_code, name, created_by_user_id, updated_by_user_id, source_system, source_table, source_id, source_payload)
    VALUES ($1::uuid,$2,$3,$4,$5,$6,'Job-specific Rework',$7,$7,'mrm-dashboard','rework_route',$1::text,$8)`,
  [routeId, input.organizationId, order.item_id, floor.rows[0].id, order.id, routeCode, input.actorUserId ?? null, shared])
  for (const [index, setup] of input.setups.entries()) {
    if (!setup.setupName.trim() || !setup.machineFamily.trim()
      || !Number.isFinite(setup.cycleTimeSeconds) || setup.cycleTimeSeconds <= 0
      || !Number.isFinite(setup.setupTimeMinutes) || setup.setupTimeMinutes < 0
      || !Number.isFinite(setup.stageWeight) || setup.stageWeight <= 0
      || (setup.operationWeight !== undefined && (!Number.isFinite(setup.operationWeight) || setup.operationWeight < 0))
      || !setup.inspectionChecks.length || setup.inspectionChecks.some(check => !check.trim())) {
      throw new ShopFloorConflictError(`Complete setup ${index + 1}: name, machine family, positive cycle/piece weight, setup time and inspection checks.`)
    }
    const machines = await client.query<{ machineFamily: string; machineType: string; machine_type_id: string }>(
      `SELECT source_payload->>'machineFamily' AS "machineFamily", source_payload->>'machineType' AS "machineType", machine_type_id
       FROM catalog.machines WHERE organization_id = $1 AND production_floor_id = $2 AND active
         AND lower(btrim(source_payload->>'machineFamily')) = lower(btrim($3))`, [input.organizationId, floor.rows[0].id, setup.machineFamily])
    const machineType = machineTypeForFamily(machines.rows, setup.machineFamily)
    if (!machineType) throw new ShopFloorConflictError(`Select an active, consistently configured Machine Family for setup ${index + 1}.`)
    const payload = { ...shared, setupNo: String(index + 1), setupName: setup.setupName.trim(),
      numberOfSetups: input.setups.length, machineFamily: setup.machineFamily.trim(), machineUsed: setup.machineFamily.trim(), machineType,
      stageWeight: setup.stageWeight, operationWeight: setup.operationWeight || setup.stageWeight,
      fixture: setup.fixture?.trim() ?? "", tooling: setup.tooling?.trim() ?? "", foamTool: setup.foamTool?.trim() ?? "" }
    const setupId = randomUUID()
    await client.query(`INSERT INTO manufacturing.operation_setups (id, organization_id, route_option_id, setup_number,
      operation_code, operation_name, sequence, machine_type_id, created_by_user_id, updated_by_user_id,
      source_system, source_table, source_id, source_payload)
      VALUES ($1::uuid,$2,$3,$4,$5,$5,$4,$6,$7,$7,'mrm-dashboard','dataEntries',$1::text,$8)`,
    [setupId, input.organizationId, routeId, index + 1, setup.setupName.trim(), machines.rows[0]!.machine_type_id, input.actorUserId ?? null, payload])
    await client.query(`INSERT INTO manufacturing.operation_cycle_standards (organization_id, operation_setup_id,
      cycle_time_seconds, setup_time_minutes, created_by_user_id, updated_by_user_id, source_system, source_table, source_id, source_payload)
      VALUES ($1,$2,$3,$4,$5,$5,'mrm-dashboard','rework_route',$6,$7)`,
    [input.organizationId, setupId, setup.cycleTimeSeconds, setup.setupTimeMinutes, input.actorUserId ?? null, randomUUID(),
      { ...payload, cycleTime: setup.cycleTimeSeconds, setupTimeMinutes: setup.setupTimeMinutes, piecesPerCycle: 1 }])
    const codes = requiredToolingCodes(payload)
    for (const code of codes.length ? codes : [null]) {
      if (code && !(await client.query(`SELECT 1 FROM store.item_types WHERE organization_id = $1 AND lower(type_code) = lower($2) AND active`, [input.organizationId, code])).rows.length) {
        throw new ShopFloorConflictError(`Tooling Asset Code ${code} was not found in Store.`)
      }
      await client.query(`INSERT INTO manufacturing.operation_tooling (organization_id, operation_setup_id, tool_code,
        created_by_user_id, updated_by_user_id, source_system, source_table, source_id, source_payload)
        VALUES ($1,$2,$3,$4,$4,'mrm-dashboard','rework_route',$5,$6)`,
      [input.organizationId, setupId, code, input.actorUserId ?? null, randomUUID(), payload])
    }
    for (const [checkIndex, check] of setup.inspectionChecks.entries()) {
      const code = `RW-${routeId}-${index + 1}-${checkIndex + 1}`
      await client.query(`INSERT INTO quality.parameter_definitions (organization_id, item_id, route_option_id,
        operation_setup_id, parameter_code, name, data_type, sequence, created_by_user_id, updated_by_user_id,
        source_system, source_table, source_id, source_payload)
        VALUES ($1,$2,$3,$4,$5,$6,'boolean',$7,$8,$8,'mrm-dashboard','rework_route',$9,$10)`,
      [input.organizationId, order.item_id, routeId, setupId, code, check.trim(), checkIndex + 1, input.actorUserId ?? null, randomUUID(),
        { ...payload, code, parameterName: check.trim(), specification: check.trim(), required: "Yes", inputType: "pass_fail", status: "Active" }])
    }
  }
  await client.query("UPDATE manufacturing.route_selections SET reversed_at = now() WHERE work_order_id = $1 AND reversed_at IS NULL", [order.id])
  await client.query(`INSERT INTO manufacturing.route_selections (organization_id, work_order_id, route_option_id,
    selected_by_user_id, reason, source_system, source_table, source_id, source_payload)
    VALUES ($1,$2,$3,$4,'Job-specific rework route selected by planner','mrm-dashboard','routeSelections',$5,$6)`,
  [input.organizationId, order.id, routeId, input.actorUserId ?? null, randomUUID(), { ...shared, jobCardNumber: input.jobCardNumber, routeCode }])
  await client.query(`UPDATE manufacturing.shop_floor_setup_state SET active = false, updated_at = now(), row_version = row_version + 1
    WHERE work_order_id = $1 AND active AND stage = 'planned'`, [order.id])
  return { routeId, routeCode }
}

export async function rejectJobRework(client: PoolClient, input: ReworkContext & {
  quantity: number; rejectedOn: string; reason: string; replacementRequiredRmKg: number; replacementRmPoNo?: string
}) {
  const order = await reworkActivity(client, input)
  if (!Number.isSafeInteger(input.quantity) || input.quantity !== Number(order.ordered_quantity)) {
    throw new ShopFloorConflictError("Reject the full quantity of the selected Rework activity.")
  }
  const date = new Date(`${input.rejectedOn}T00:00:00Z`)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.rejectedOn) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== input.rejectedOn || input.rejectedOn > today || input.rejectedOn < String(order.source_payload.receivedOn ?? "")) {
    throw new ShopFloorConflictError("Enter a valid rejection date on or after receipt and not in the future.")
  }
  if (!input.reason.trim() || !Number.isFinite(input.replacementRequiredRmKg) || input.replacementRequiredRmKg <= 0) {
    throw new ShopFloorConflictError("Enter the rejection reason and positive Required RM (kg) for replacement.")
  }
  const open = await client.query<{ session_reference: string }>(`SELECT session_reference FROM manufacturing.production_sessions
    WHERE work_order_id = $1 AND status = 'open' AND reversed_at IS NULL LIMIT 1`, [order.id])
  if (open.rows[0]) throw new ShopFloorConflictError(`Close Production Session ${open.rows[0].session_reference} before rejecting rework.`)
  if ((await client.query(`SELECT 1 FROM manufacturing.dispatch_approval_events WHERE work_order_id = $1
    AND decision = 'approved' AND reversed_at IS NULL LIMIT 1`, [order.id])).rows.length) {
    throw new ShopFloorConflictError("Dispatched rework cannot be rejected as an entire batch.")
  }
  const rootId = String(order.source_payload.revisionRootWorkOrderId)
  const root = await client.query<{ job_card_number: string }>("SELECT job_card_number FROM manufacturing.work_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE", [rootId, input.organizationId])
  if (!root.rows[0]) throw new ShopFloorConflictError("Original Job Card was not found.")
  const revision = await client.query<{ value: number }>(`SELECT COALESCE(max((source_payload->>'revisionNumber')::integer), 0) + 1 AS value
    FROM manufacturing.work_orders WHERE organization_id = $1 AND source_payload->>'revisionRootWorkOrderId' = $2`, [input.organizationId, rootId])
  const revisionNumber = Number(revision.rows[0]!.value)
  const rootJobCardNumber = root.rows[0].job_card_number
  const replacementJobCardNumber = `${rootJobCardNumber} · Rev ${revisionNumber} · Replacement`
  const rmPoNo = input.replacementRmPoNo?.trim() || String(order.source_payload.rmPoNo ?? "").trim()
    || String((await client.query<{ po: string }>(`SELECT COALESCE(NULLIF(source_payload->>'rmPoNo', ''), source_payload->>'RM PO NO.') AS po FROM manufacturing.work_orders WHERE id = $1`, [rootId])).rows[0]?.po ?? "").trim()
  if (!rmPoNo) throw new ShopFloorConflictError("Enter the RM PO Number for replacement material.")
  const trial = await client.query<{ quantity: string }>(`SELECT COALESCE(sum(quantity_rejected), 0)::text AS quantity
    FROM manufacturing.production_entries WHERE work_order_id = $1 AND reversed_at IS NULL`, [order.id])
  const trialRejectedQuantity = Number(trial.rows[0]!.quantity)
  if (trialRejectedQuantity > input.quantity) throw new ShopFloorConflictError("Recorded trial rejections exceed this batch. Correct those records first.")
  const rejection = { reworkRejectedOn: input.rejectedOn, reworkRejectedAt: new Date().toISOString(),
    reworkRejectedQuantity: input.quantity, trialRejectedQuantity, additionalBatchRejectedQuantity: input.quantity - trialRejectedQuantity,
    reworkRejectionReason: input.reason.trim(), replacementJobCardNumber, rejectedByUserId: input.actorUserId ?? null }
  const payload = { ...order.source_payload, ...rejection, status: "Rejected" }
  await client.query(`UPDATE manufacturing.work_orders SET status = 'Rejected', source_payload = $2,
    updated_by_user_id = $3, updated_at = now(), row_version = row_version + 1 WHERE id = $1`, [order.id, payload, input.actorUserId ?? null])
  await client.query(`WITH previous AS MATERIALIZED (
    SELECT id, stage FROM manufacturing.shop_floor_setup_state WHERE organization_id = $1 AND work_order_id = $2 AND active FOR UPDATE
  ), stopped AS (
    UPDATE manufacturing.shop_floor_setup_state state SET active = false, stage = 'cancelled', updated_at = now(),
      row_version = state.row_version + 1, updated_by_user_id = $3,
      source_payload = COALESCE(state.source_payload, '{}'::jsonb) || $4::jsonb
    FROM previous WHERE state.id = previous.id RETURNING state.id, state.machine_id, previous.stage AS from_stage
  ) INSERT INTO manufacturing.shop_floor_stage_events (organization_id, setup_state_id, from_stage, to_stage,
    machine_id, actor_user_id, reason, source_system, source_table, source_id, source_payload)
    SELECT $1, id, from_stage, 'cancelled', machine_id, $3, $5, 'mrm-dashboard', 'rework_rejected', gen_random_uuid()::text, $4
    FROM stopped`, [input.organizationId, order.id, input.actorUserId ?? null, { ...rejection, status: "rejected" }, input.reason.trim()])
  await client.query(`UPDATE manufacturing.material_movement_waits SET ended_at = GREATEST(ready_at, now())
    WHERE work_order_id = $1 AND ended_at IS NULL`, [order.id])
  const replacementId = randomUUID()
  const replacement = { isRevision: true, isRework: false, disposition: "replacement", createdFromReworkRejection: true,
    revisionNumber, revisionRootWorkOrderId: rootId, rootJobCardNumber, replacementOfWorkOrderId: order.id,
    originalJobCardNumber: input.jobCardNumber, jcNo: replacementJobCardNumber, partCode: order.part_code,
    fgPoNo: order.source_payload.fgPoNo ?? order.work_order_number, orderPcs: input.quantity, quantity: input.quantity,
    returnQuantity: order.source_payload.returnQuantity, receiptReference: order.source_payload.receiptReference,
    receivedOn: order.source_payload.receivedOn, receivedAt: new Date().toISOString(),
    reason: `Replacement after failed rework: ${input.reason.trim()}`, requiredRmKg: input.replacementRequiredRmKg,
    rmPoNo, productionFloorCode: input.productionFloorCode, ...rejection }
  await client.query(`INSERT INTO manufacturing.work_orders (id, organization_id, work_order_number, job_card_number,
    item_id, ordered_quantity, created_by_user_id, updated_by_user_id, source_system, source_table, source_id, source_payload)
    VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$7,'mrm-dashboard','work_order',$1::text,$8)`,
  [replacementId, input.organizationId, order.work_order_number, replacementJobCardNumber, order.item_id, input.quantity, input.actorUserId ?? null, replacement])
  await client.query(`INSERT INTO audit.events (organization_id, actor_user_id, event_type, target_schema, target_table,
    target_id, reason, before_state, after_state, source_system, source_table, source_id)
    VALUES ($1,$2,'production.rework.rejected','manufacturing','work_orders',$3,$4,$5,$6,'mrm-dashboard','rework_rejected',$7)`,
  [input.organizationId, input.actorUserId ?? null, order.id, input.reason.trim(), order.source_payload, { ...rejection, replacementId }, randomUUID()])
  return { rootJobCardNumber, revisionNumber, replacementJobCardNumber, receiptReference: order.source_payload.receiptReference }
}
