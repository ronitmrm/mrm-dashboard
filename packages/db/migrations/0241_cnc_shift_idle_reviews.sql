CREATE TABLE manufacturing.cnc_shift_idle_reviews (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('A', 'B', 'C')),
  machine_id uuid NOT NULL REFERENCES catalog.machines(id),
  gap_start timestamptz NOT NULL,
  gap_end timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'programmer_unavailable', 'operator_unavailable', 'breakdown',
    'raw_material_unavailable', 'setup_incomplete', 'no_job_assigned', 'other'
  )),
  note text CHECK (length(note) <= 500),
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  PRIMARY KEY (organization_id, production_date, shift, machine_id, gap_start, gap_end),
  CHECK (gap_end > gap_start AND gap_end - gap_start <= interval '8 hours'),
  CHECK (reason <> 'other' OR COALESCE(length(btrim(note)), 0) > 0)
);

GRANT SELECT, INSERT, UPDATE ON manufacturing.cnc_shift_idle_reviews TO mrmpl_web;
GRANT SELECT ON manufacturing.cnc_shift_idle_reviews TO mrmpl_reporting;

CREATE INDEX shop_floor_stage_events_machine_time_idx
  ON manufacturing.shop_floor_stage_events (organization_id, machine_id, occurred_at DESC, id DESC)
  WHERE reversed_at IS NULL;
