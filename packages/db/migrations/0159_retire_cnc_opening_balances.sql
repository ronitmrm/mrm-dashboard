-- Apply only after web and worker no longer read the retired opening schema.
-- Operational data is never silently deleted by this migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM manufacturing.production_opening_balances)
     OR EXISTS (SELECT 1 FROM manufacturing.production_opening_batches) THEN
    RAISE EXCEPTION 'CNC opening records remain; reconcile the authorized reset before retiring the schema.';
  END IF;
END;
$$;

DROP TRIGGER production_entry_opening_cutoff ON manufacturing.production_entries;
DROP TRIGGER production_session_opening_cutoff ON manufacturing.production_sessions;
DROP FUNCTION manufacturing.check_opening_production_cutoff();
DROP TABLE manufacturing.production_opening_balances;
DROP TABLE manufacturing.production_opening_batches;
