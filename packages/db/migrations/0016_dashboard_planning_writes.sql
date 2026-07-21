-- Coalesce accepted planning writes onto one durable dashboard refresh job.

CREATE UNIQUE INDEX refresh_jobs_active_queue_unique
  ON derived.refresh_jobs (organization_id, queue_key)
  WHERE status IN ('pending', 'running');

CREATE INDEX shop_floor_setup_state_machine_lock_idx
  ON manufacturing.shop_floor_setup_state (machine_id, active)
  WHERE active AND machine_id IS NOT NULL;

CREATE INDEX operation_setups_route_number_idx
  ON manufacturing.operation_setups (route_option_id, setup_number)
  WHERE active;
