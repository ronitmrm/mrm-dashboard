-- Preserve separate running balances on each machine for the same job/setup.
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO STRICT constraint_name
  FROM pg_constraint
  WHERE conrelid = 'manufacturing.production_opening_balances'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (work_order_id, route_option_id, operation_setup_id)';
  EXECUTE format('ALTER TABLE manufacturing.production_opening_balances DROP CONSTRAINT %I', constraint_name);
END;
$$;

ALTER TABLE manufacturing.production_opening_balances
  ADD CONSTRAINT production_opening_setup_machine_unique
  UNIQUE NULLS NOT DISTINCT (work_order_id, route_option_id, operation_setup_id, machine_id);

-- Each running machine also needs its own workflow state.
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO STRICT constraint_name
  FROM pg_constraint
  WHERE conrelid = 'manufacturing.shop_floor_setup_state'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (work_order_id, route_option_id, operation_setup_id)';
  EXECUTE format('ALTER TABLE manufacturing.shop_floor_setup_state DROP CONSTRAINT %I', constraint_name);
END;
$$;

ALTER TABLE manufacturing.shop_floor_setup_state
  ADD CONSTRAINT shop_floor_setup_machine_unique
  UNIQUE NULLS NOT DISTINCT (work_order_id, route_option_id, operation_setup_id, machine_id);
