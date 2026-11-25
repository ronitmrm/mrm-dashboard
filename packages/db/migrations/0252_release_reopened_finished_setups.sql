-- A planner move left the old machine's Quality Approval task open. Completing
-- it later created a new active setup state on the old machine even though the
-- setup had already finished elsewhere (e.g. P1287 Setup 1 on CNC-14), so the
-- machine looked busy to planning while the shop floor showed it idle.
-- Release such rows the same way a planner release does. Rows with production,
-- an open session, operator start, or a live planner decision for that machine
-- (e.g. a parallel machine) are left alone.
WITH reopened AS (
  SELECT state.id, state.stage
  FROM manufacturing.shop_floor_setup_state state
  WHERE state.active
    AND state.stage IN ('raw_material_at_machine', 'presetting', 'setting', 'quality_approval')
    AND EXISTS (
      SELECT 1 FROM manufacturing.shop_floor_setup_state finished
      WHERE finished.work_order_id = state.work_order_id
        AND finished.operation_setup_id = state.operation_setup_id
        AND finished.id <> state.id
        AND finished.machine_id IS DISTINCT FROM state.machine_id
        AND finished.stage = 'item_complete' AND NOT finished.active
        AND COALESCE(finished.completed_at, finished.updated_at) < state.created_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM manufacturing.production_entries entry
      WHERE entry.work_order_id = state.work_order_id
        AND entry.operation_setup_id = state.operation_setup_id
        AND entry.machine_id = state.machine_id AND entry.reversed_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM manufacturing.production_sessions session
      WHERE session.work_order_id = state.work_order_id
        AND session.operation_setup_id = state.operation_setup_id
        AND session.machine_id = state.machine_id AND session.reversed_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM manufacturing.plan_override_events decision
      WHERE decision.work_order_id = state.work_order_id
        AND (decision.operation_setup_id = state.operation_setup_id OR decision.operation_setup_id IS NULL)
        AND decision.target_machine_id = state.machine_id
        AND decision.reversed_at IS NULL
    )
), released AS (
  UPDATE manufacturing.shop_floor_setup_state state
  SET stage = 'planned', active = false, completed_at = NULL,
    source_payload = state.source_payload || jsonb_build_object(
      'stage', 'planned', 'status', 'stopped',
      'reason', 'Released: setup already Item Complete on another machine'),
    updated_at = now(), row_version = state.row_version + 1
  FROM reopened
  WHERE state.id = reopened.id
  RETURNING state.id, state.organization_id, state.machine_id, reopened.stage AS from_stage
)
INSERT INTO manufacturing.shop_floor_stage_events (
  organization_id, setup_state_id, from_stage, to_stage, machine_id, reason,
  source_system, source_table, source_id, source_payload
)
SELECT organization_id, id, from_stage, 'planned', machine_id,
  'Released: setup already Item Complete on another machine',
  'mrm-dashboard', 'migration', gen_random_uuid()::text,
  jsonb_build_object('migration', '0252_release_reopened_finished_setups')
FROM released;
