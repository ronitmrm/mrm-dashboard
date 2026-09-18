CREATE TABLE manufacturing.production_opening_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES core.organizations(id),
  cutoff_at timestamptz NOT NULL,
  source_digest text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE manufacturing.production_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES manufacturing.production_opening_batches(id),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  route_option_id uuid NOT NULL REFERENCES manufacturing.route_options(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  quantity_good numeric(20,0) NOT NULL CHECK (quantity_good >= 0),
  quantity_rejected numeric(20,0) NOT NULL CHECK (quantity_rejected >= 0),
  status text NOT NULL CHECK (status IN ('running', 'completed')),
  source_id text NOT NULL UNIQUE,
  source_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, route_option_id, operation_setup_id),
  CHECK (status <> 'running' OR machine_id IS NOT NULL)
);

CREATE TRIGGER sync_dashboard_source_opening_balances
AFTER INSERT OR UPDATE OR DELETE ON manufacturing.production_opening_balances
FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record(
  'data_entry', 'dataEntries', 'production_opening_balance', 'created_at', 'created_at', 'any'
);

-- Block ambiguous daily entries and historical sessions for migrated setups.
CREATE FUNCTION manufacturing.check_opening_production_cutoff() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE cutoff timestamptz;
BEGIN
  IF (NEW.operation_setup_id IS NULL OR NEW.route_option_id IS NULL) AND EXISTS (
    SELECT 1 FROM manufacturing.production_opening_balances WHERE work_order_id = NEW.work_order_id
  ) THEN
    RAISE EXCEPTION 'A migrated Job Card requires an explicit route and setup for subsequent production.';
  END IF;
  SELECT batch.cutoff_at INTO cutoff
  FROM manufacturing.production_opening_balances balance
  JOIN manufacturing.production_opening_batches batch ON batch.id = balance.batch_id
  WHERE balance.work_order_id = NEW.work_order_id
    AND balance.route_option_id = NEW.route_option_id
    AND balance.operation_setup_id = NEW.operation_setup_id;
  IF cutoff IS NOT NULL AND (
    NEW.started_at < cutoff OR
    (NEW.started_at IS NULL AND NEW.production_date <= (cutoff AT TIME ZONE 'Asia/Kolkata')::date)
  ) THEN
    RAISE EXCEPTION 'Production overlaps the CNC opening cutoff; enter only post-cutoff output with its actual start time.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER production_entry_opening_cutoff
BEFORE INSERT OR UPDATE ON manufacturing.production_entries
FOR EACH ROW EXECUTE FUNCTION manufacturing.check_opening_production_cutoff();
CREATE TRIGGER production_session_opening_cutoff
BEFORE INSERT OR UPDATE ON manufacturing.production_sessions
FOR EACH ROW EXECUTE FUNCTION manufacturing.check_opening_production_cutoff();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON manufacturing.production_opening_batches,
  manufacturing.production_opening_balances FROM mrmpl_web, mrmpl_worker;
GRANT SELECT ON manufacturing.production_opening_batches,
  manufacturing.production_opening_balances TO mrmpl_web, mrmpl_worker;
