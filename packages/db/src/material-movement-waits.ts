import type { Pool, PoolClient } from "pg"
import { productionBreakMinutes, type ProductionBreak } from "./production-breaks"
import { withTransaction } from "./postgres-runtime"

type QueryClient = Pick<PoolClient, "query">
type MovementCalendar = { holidayDates: string[]; workingDates: string[]; breaks: ProductionBreak[] }

// The durable publication event runs this with a fresh snapshot, after the plan commits.
export async function syncMaterialMovementWaits(pool: Pool, organizationId: string) {
  await withTransaction(pool, async client => {
    // Canonical arrivals/occupation end a wait even if a whole cycle happened
    // between publications. No stage writer or planning snapshot owns these times.
    await client.query(`WITH ended AS (
      SELECT DISTINCT ON (wait.id) wait.id, event.occurred_at
      FROM manufacturing.material_movement_waits wait
      JOIN manufacturing.shop_floor_stage_events event ON event.organization_id = $1
        AND event.machine_id = wait.machine_id AND event.occurred_at >= wait.ready_at
        AND event.to_stage NOT IN ('planned', 'item_complete')
      WHERE wait.organization_id = $1 AND wait.ended_at IS NULL
      ORDER BY wait.id, event.occurred_at, event.id
    ) UPDATE manufacturing.material_movement_waits wait SET ended_at = ended.occurred_at
      FROM ended WHERE wait.id = ended.id`, [organizationId])
    await client.query(`
    WITH planned AS MATERIALIZED (
      SELECT DISTINCT ON (machine.id) work_order.id AS work_order_id, setup.id AS setup_id,
        machine.id AS machine_id, floor.production_floor_code, plan.row,
        NOT EXISTS (SELECT 1 FROM manufacturing.operation_setups previous
          WHERE previous.route_option_id = route.id AND previous.sequence < setup.sequence AND previous.active) AS first_setup,
        floor.payload #> '{productionControl,planningCalendar}' AS calendar,
        COALESCE(schedule.breaks, '[]'::jsonb) AS breaks
      FROM derived.dashboard_floor_read_models floor
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(
        floor.payload #> '{productionControl,machinePlanDetailRows}', '[]'::jsonb)) plan(row)
      JOIN manufacturing.work_orders work_order ON work_order.organization_id = $1
        AND lower(work_order.job_card_number) = lower(plan.row->>'jcNo')
        AND work_order.status <> 'Cancelled'
      JOIN manufacturing.route_options route ON route.item_id = work_order.item_id
        AND route.route_code = plan.row->>'optionNumber'
      JOIN manufacturing.operation_setups setup ON setup.route_option_id = route.id
        AND setup.setup_number::text = COALESCE(NULLIF(plan.row->>'routeSetupNo', ''), plan.row->>'setupNo')
      JOIN catalog.machines machine ON machine.organization_id = $1
        AND lower(machine.machine_number) = lower(plan.row->>'machine')
      JOIN manufacturing.production_floors unit ON unit.id = machine.production_floor_id
        AND unit.code = floor.production_floor_code
      LEFT JOIN manufacturing.production_break_schedules schedule
        ON schedule.organization_id = $1 AND schedule.production_floor_id = unit.id
      WHERE floor.organization_id = $1 AND floor.publication_version = (
        SELECT max(version) FROM derived.dashboard_read_model_heads WHERE organization_id = $1)
        AND route.production_floor_id = unit.id
        AND COALESCE(plan.row->>'shopFloorStage', '') IN ('', 'planned')
        AND COALESCE(plan.row->>'runningStatus', '') <> 'Complete'
        AND COALESCE(migration.try_numeric(plan.row->>'pendingGoodQty'), 0) > 0
      ORDER BY machine.id,
        migration.try_date(COALESCE(plan.row->>'plannedProductionStartDate', plan.row->>'setupPlannedDate')),
        setup.setup_number, plan.row->>'partCode'
    ), ready AS MATERIALIZED (
      SELECT * FROM planned
      WHERE row->>'shopFloorTaskReady' = 'true'
        AND (first_setup AND COALESCE((SELECT sum(receipt.quantity_kg) FROM manufacturing.raw_material_receipts receipt
          WHERE receipt.organization_id = $1 AND lower(receipt.job_card_number) = lower(row->>'jcNo')
            AND receipt.reversed_at IS NULL), 0)
          > COALESCE((SELECT sum(rejected_kg) FROM manufacturing.raw_material_rejection_events
            WHERE work_order_id = planned.work_order_id), 0)
          OR NOT first_setup AND COALESCE(migration.try_numeric(row->>'physicalWipQty'), 0) > 0)
        AND NOT EXISTS (SELECT 1 FROM manufacturing.shop_floor_setup_state state
          WHERE state.machine_id = planned.machine_id AND state.active AND state.stage <> 'planned')
        AND NOT EXISTS (SELECT 1 FROM manufacturing.production_sessions session
          WHERE session.machine_id = planned.machine_id AND session.status = 'open' AND session.reversed_at IS NULL)
    ), closed AS (
      UPDATE manufacturing.material_movement_waits wait
      SET ended_at = GREATEST(ready_at, $2::timestamptz)
      WHERE wait.organization_id = $1 AND wait.ended_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM ready WHERE ready.work_order_id = wait.work_order_id
          AND ready.setup_id = wait.operation_setup_id AND ready.machine_id = wait.machine_id)
      RETURNING id
    )
    INSERT INTO manufacturing.material_movement_waits
      (organization_id, work_order_id, operation_setup_id, machine_id, ready_at, calendar)
    SELECT $1, work_order_id, setup_id, machine_id, $2::timestamptz, jsonb_build_object(
      'holidayDates', COALESCE(calendar->'holidayDates', '[]'::jsonb),
      'workingDates', COALESCE(calendar->'workingDates', '[]'::jsonb), 'breaks', breaks)
    FROM ready ON CONFLICT (work_order_id, operation_setup_id, machine_id)
      WHERE ended_at IS NULL DO NOTHING`, [organizationId, new Date().toISOString()])
  })
}

export function materialMovementWorkingMinutes(start: Date, end: Date, floor: string, calendar: MovementCalendar) {
  const minute = 60_000
  const day = 1440 * minute
  const offset = 330 * minute
  const opens = floor === "cnc" ? 360 : 510
  const closes = floor === "cnc" ? 1800 : 1200
  const first = Math.floor((start.getTime() + offset - opens * minute) / day)
  const last = Math.floor((end.getTime() + offset - opens * minute) / day)
  let minutes = 0
  for (let index = first; index <= last; index++) {
    const date = new Date(index * day).toISOString().slice(0, 10)
    if (calendar.holidayDates.includes(date)
      || (new Date(index * day).getUTCDay() === 5 && !calendar.workingDates.includes(date))) continue
    const startedAt = new Date(Math.max(start.getTime(), index * day - offset + opens * minute))
    const endedAt = new Date(Math.min(end.getTime(), index * day - offset + closes * minute))
    if (endedAt <= startedAt) continue
    minutes += (endedAt.getTime() - startedAt.getTime()) / minute
      - productionBreakMinutes({ startedAt, endedAt, breaks: calendar.breaks, downtime: [] }).breakMinutes
  }
  return Math.max(0, Math.floor(minutes))
}

export async function readMaterialMovementWaits(client: QueryClient, organizationId: string,
  floor: string, jobCardNumber: string) {
  const result = await client.query<{
    id: string; jobCardNumber: string; partCode: string; setupNumber: number; optionNumber: string
    machineNumber: string; readyAt: Date; endedAt: Date | null; outcome: string | null
    recordedBy: string | null; reason: string | null; calendar: MovementCalendar
  }>(`SELECT wait.id, work_order.job_card_number AS "jobCardNumber", item.uid AS "partCode",
      setup.setup_number AS "setupNumber", route.route_code AS "optionNumber",
      machine.machine_number AS "machineNumber", wait.ready_at AS "readyAt",
      COALESCE(event.occurred_at, wait.ended_at) AS "endedAt",
      CASE WHEN event.reversed_at IS NOT NULL THEN 'corrected'
        WHEN event.work_order_id = wait.work_order_id AND event.operation_setup_id = wait.operation_setup_id
          THEN CASE WHEN event.to_stage = 'raw_material_at_machine' THEN 'arrived' ELSE 'unrecorded' END
        WHEN event.id IS NULL AND wait.ended_at IS NULL AND EXISTS (
          SELECT 1 FROM manufacturing.shop_floor_setup_state state
          WHERE state.machine_id = wait.machine_id AND state.active AND state.stage <> 'planned') THEN 'unrecorded'
        WHEN event.id IS NOT NULL OR wait.ended_at IS NOT NULL THEN 'blocked' END AS outcome,
      COALESCE(NULLIF(event.legacy_actor, ''), actor.name) AS "recordedBy", event.reason,
      wait.calendar
    FROM manufacturing.material_movement_waits wait
    JOIN manufacturing.work_orders work_order ON work_order.id = wait.work_order_id
    JOIN catalog.items item ON item.id = work_order.item_id
    JOIN manufacturing.operation_setups setup ON setup.id = wait.operation_setup_id
    JOIN manufacturing.route_options route ON route.id = setup.route_option_id
    JOIN catalog.machines machine ON machine.id = wait.machine_id
    JOIN manufacturing.production_floors unit ON unit.id = machine.production_floor_id
    LEFT JOIN LATERAL (
      SELECT stage_event.*, state.work_order_id, state.operation_setup_id
      FROM manufacturing.shop_floor_stage_events stage_event
      JOIN manufacturing.shop_floor_setup_state state ON state.id = stage_event.setup_state_id
      WHERE stage_event.organization_id = $1 AND stage_event.machine_id = wait.machine_id
        AND stage_event.to_stage NOT IN ('planned', 'item_complete')
        AND stage_event.occurred_at >= wait.ready_at
        AND (wait.ended_at IS NULL OR stage_event.occurred_at <= wait.ended_at)
      ORDER BY stage_event.occurred_at, stage_event.id LIMIT 1
    ) event ON true
    LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
    WHERE wait.organization_id = $1 AND unit.code = $2
      AND lower(work_order.job_card_number) = lower($3)
    ORDER BY wait.ready_at DESC`, [organizationId, floor, jobCardNumber])
  const now = new Date()
  return result.rows.map(({ calendar, readyAt, endedAt, ...row }) => ({ ...row,
    readyAt: readyAt.toISOString(), endedAt: endedAt?.toISOString() ?? null,
    workingMinutes: row.outcome === "corrected" || row.outcome === "unrecorded" || (endedAt && endedAt < readyAt) ? null
      : materialMovementWorkingMinutes(readyAt, endedAt ?? now, floor, calendar) }))
}
