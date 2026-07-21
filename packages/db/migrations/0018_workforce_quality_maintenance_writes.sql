-- Relational write identities and nested evidence for workforce, quality,
-- setup-checklist, and maintenance workflows.

CREATE TABLE workforce.attendance_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  attendance_record_id uuid NOT NULL REFERENCES workforce.attendance_records(id),
  status text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX attendance_record_events_record_time_idx
  ON workforce.attendance_record_events (attendance_record_id, occurred_at);

ALTER TABLE quality.first_piece_inspections
  ADD COLUMN check_key text;

WITH ranked_keys AS (
  SELECT
    id,
    COALESCE(
      source_payload->'payload'->>'reportId',
      source_payload->>'reportId',
      source_id
    ) AS base_key,
    row_number() OVER (
      PARTITION BY organization_id, lower(COALESCE(
        source_payload->'payload'->>'reportId',
        source_payload->>'reportId',
        source_id
      ))
      ORDER BY COALESCE(
        migration.try_timestamptz(source_payload->'payload'->>'taskCompletedAt'),
        migration.try_timestamptz(source_payload->>'createdAt'),
        inspected_at
      ) DESC, source_id DESC
    ) AS key_rank
  FROM quality.first_piece_inspections
)
UPDATE quality.first_piece_inspections inspection
SET check_key = CASE
  WHEN ranked.key_rank = 1 THEN ranked.base_key
  ELSE ranked.base_key || '|legacy|' || inspection.source_id
END
FROM ranked_keys ranked
WHERE ranked.id = inspection.id;

ALTER TABLE quality.first_piece_inspections
  ALTER COLUMN check_key SET NOT NULL;

CREATE UNIQUE INDEX first_piece_inspections_active_key_unique
  ON quality.first_piece_inspections (organization_id, lower(check_key))
  WHERE reversed_at IS NULL;

CREATE TABLE quality.first_piece_reading_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  reading_id uuid NOT NULL REFERENCES quality.first_piece_readings(id) ON DELETE CASCADE,
  sample_number integer NOT NULL CHECK (sample_number > 0),
  numeric_value numeric(20,8),
  text_value text,
  boolean_value boolean,
  result text NOT NULL,
  source_payload jsonb,
  UNIQUE (reading_id, sample_number)
);

ALTER TABLE quality.hourly_checks
  ADD COLUMN check_key text;

UPDATE quality.hourly_checks
SET check_key = COALESCE(
  source_payload->'payload'->>'checkId',
  source_payload->>'checkId',
  source_id
);

ALTER TABLE quality.hourly_checks
  ALTER COLUMN check_key SET NOT NULL;

CREATE UNIQUE INDEX hourly_checks_active_key_unique
  ON quality.hourly_checks (organization_id, lower(check_key))
  WHERE reversed_at IS NULL;

ALTER TABLE quality.setup_checklist_template_items
  ADD COLUMN active boolean NOT NULL DEFAULT true;

ALTER TABLE quality.setup_checklist_sessions
  ADD COLUMN session_key text;

UPDATE quality.setup_checklist_sessions
SET session_key = COALESCE(
  source_payload->'payload'->>'sessionId',
  source_payload->>'sessionId',
  source_id
);

ALTER TABLE quality.setup_checklist_sessions
  ALTER COLUMN session_key SET NOT NULL;

CREATE UNIQUE INDEX setup_checklist_sessions_active_key_unique
  ON quality.setup_checklist_sessions (organization_id, lower(session_key))
  WHERE reversed_at IS NULL;

ALTER TABLE quality.setup_checklist_results
  ADD COLUMN phase text NOT NULL DEFAULT 'end'
  CHECK (phase IN ('start', 'end'));

ALTER TABLE quality.setup_checklist_results
  DROP CONSTRAINT setup_checklist_results_session_id_template_item_id_key;

CREATE UNIQUE INDEX setup_checklist_results_session_item_phase_unique
  ON quality.setup_checklist_results (session_id, template_item_id, phase);

ALTER TABLE maintenance.definitions
  ADD COLUMN checklist_code text,
  ADD COLUMN frequency_basis text,
  ADD COLUMN estimated_minutes integer
    CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0);

UPDATE maintenance.definitions
SET checklist_code = COALESCE(
    source_payload->'payload'->>'checklistCode',
    source_payload->>'checklistCode',
    code
  ),
  frequency_basis = COALESCE(
    source_payload->'payload'->>'frequencyBasis',
    source_payload->>'frequencyBasis',
    'Calendar days'
  ),
  estimated_minutes = COALESCE(
    migration.try_numeric(source_payload->'payload'->>'estimatedMinutes')::integer,
    migration.try_numeric(source_payload->>'estimatedMinutes')::integer
  );

ALTER TABLE maintenance.machine_schedules
  ADD COLUMN schedule_key text;

UPDATE maintenance.machine_schedules schedule
SET schedule_key = machine.machine_number || '|' || definition.code
FROM catalog.machines machine, maintenance.definitions definition
WHERE machine.id = schedule.machine_id
  AND definition.id = schedule.definition_id;

ALTER TABLE maintenance.machine_schedules
  ALTER COLUMN schedule_key SET NOT NULL;

CREATE UNIQUE INDEX machine_schedules_key_unique
  ON maintenance.machine_schedules (organization_id, lower(schedule_key));

ALTER TABLE maintenance.tasks
  ADD COLUMN task_key text,
  ADD COLUMN task_type text;

UPDATE maintenance.tasks
SET task_key = COALESCE(
    source_payload->'payload'->>'taskId',
    source_payload->>'taskId',
    source_id
  ),
  task_type = COALESCE(
    source_payload->'payload'->>'maintenanceType',
    source_payload->>'maintenanceType',
    'Planned'
  );

ALTER TABLE maintenance.tasks
  ALTER COLUMN task_key SET NOT NULL,
  ALTER COLUMN task_type SET NOT NULL;

CREATE UNIQUE INDEX maintenance_tasks_key_unique
  ON maintenance.tasks (organization_id, lower(task_key));

CREATE INDEX maintenance_tasks_machine_schedule_time_idx
  ON maintenance.tasks (machine_schedule_id, completed_at DESC);
