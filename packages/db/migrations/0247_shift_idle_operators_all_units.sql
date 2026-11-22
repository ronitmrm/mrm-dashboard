-- The end-of-shift "operators without a machine" task now runs for every
-- production unit, not only CNC. Existing rows belong to CNC.
-- CNC keeps shifts A, B and C; the other units run one General shift.
ALTER TABLE workforce.shift_idle_operator_checks
  ADD COLUMN production_floor_code text NOT NULL DEFAULT 'cnc';
ALTER TABLE workforce.shift_idle_operators
  ADD COLUMN production_floor_code text NOT NULL DEFAULT 'cnc';
ALTER TABLE workforce.shift_idle_operator_checks
  ALTER COLUMN production_floor_code DROP DEFAULT;
ALTER TABLE workforce.shift_idle_operators
  ALTER COLUMN production_floor_code DROP DEFAULT;

-- Drop the keys and the A/B/C shift check by lookup, then rebuild them with the unit.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE (contype = 'f' AND confrelid = 'workforce.shift_idle_operator_checks'::regclass)
       OR (contype IN ('p', 'c') AND conrelid IN (
         'workforce.shift_idle_operator_checks'::regclass,
         'workforce.shift_idle_operators'::regclass))
    ORDER BY contype <> 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE workforce.shift_idle_operator_checks
  ADD PRIMARY KEY (organization_id, production_floor_code, production_date, shift),
  ADD CONSTRAINT shift_idle_operator_checks_unit_shift CHECK (
    (production_floor_code = 'cnc' AND shift IN ('A', 'B', 'C'))
    OR (production_floor_code IN ('conventional', 'conventional-02', 'forging') AND shift = 'General')
  );

ALTER TABLE workforce.shift_idle_operators
  ADD PRIMARY KEY (organization_id, production_floor_code, production_date, shift, employee_id),
  ADD CONSTRAINT shift_idle_operators_check_fkey
    FOREIGN KEY (organization_id, production_floor_code, production_date, shift)
    REFERENCES workforce.shift_idle_operator_checks (organization_id, production_floor_code, production_date, shift)
    ON DELETE CASCADE;
