// Both callers supply fixed SQL expressions for the machine and shift boundary.
export function shiftSetupAssignmentJoin(machineId: string, shiftEnd: string) {
  return `
    LEFT JOIN LATERAL (
      SELECT w.job_card_number, item.uid AS item, setup.setup_number,
        CASE WHEN event.to_stage = 'planned' THEN 'released' ELSE event.to_stage END AS stage,
        event.to_stage, event.occurred_at
      FROM (
        SELECT e.id, e.setup_state_id, e.to_stage, e.occurred_at
        FROM manufacturing.shop_floor_stage_events e
        WHERE e.organization_id = $1 AND e.machine_id = ${machineId}
          AND e.occurred_at < ${shiftEnd} AND e.reversed_at IS NULL
        ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1
      ) event
      JOIN manufacturing.shop_floor_setup_state state ON state.id = event.setup_state_id
      JOIN manufacturing.work_orders w ON w.id = state.work_order_id
      JOIN catalog.items item ON item.id = w.item_id
      JOIN manufacturing.operation_setups setup ON setup.id = state.operation_setup_id
      WHERE NOT EXISTS (
        SELECT 1 FROM manufacturing.shop_floor_stage_events later
        WHERE later.setup_state_id = event.setup_state_id AND later.reversed_at IS NULL
          AND later.occurred_at < ${shiftEnd}
          AND (later.occurred_at, later.id) > (event.occurred_at, event.id)
      )
    ) assignment ON assignment.to_stage IN (
      'raw_material_at_machine', 'presetting', 'setting', 'quality_approval', 'operator_started'
    ) OR (assignment.to_stage = 'planned' AND assignment.occurred_at >= ${shiftEnd} - interval '8 hours')
  `
}
