CREATE TABLE manufacturing.material_movement_waits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid NOT NULL REFERENCES catalog.machines(id),
  ready_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  calendar jsonb NOT NULL,
  CHECK (ended_at IS NULL OR ended_at >= ready_at)
);
CREATE UNIQUE INDEX material_movement_waits_open_unique
  ON manufacturing.material_movement_waits (work_order_id, operation_setup_id, machine_id)
  WHERE ended_at IS NULL;
CREATE INDEX material_movement_waits_job_history
  ON manufacturing.material_movement_waits (organization_id, work_order_id, ready_at DESC);

CREATE INDEX shop_floor_stage_events_material_movement
  ON manufacturing.shop_floor_stage_events (organization_id, machine_id, occurred_at)
  WHERE to_stage NOT IN ('planned', 'item_complete');
