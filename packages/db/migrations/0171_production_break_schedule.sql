CREATE TABLE manufacturing.production_break_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_floor_id uuid NOT NULL REFERENCES manufacturing.production_floors(id),
  breaks jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(breaks) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, production_floor_id)
);

INSERT INTO manufacturing.production_break_schedules (
  organization_id, production_floor_id, breaks
)
SELECT organization_id, id,
  '[{"startTime":"02:00","endTime":"02:15"},{"startTime":"10:30","endTime":"10:45"},{"startTime":"16:30","endTime":"16:45"}]'::jsonb
FROM manufacturing.production_floors
WHERE code = 'cnc';

INSERT INTO identity.permissions (key, module, name, description)
SELECT 'masters.' || floor.code || '.production_break_schedule.' || action.name,
  'masters', floor.name || ' / Production Break Schedule / ' || action.name,
  'Read or edit scheduled production breaks for this production unit.'
FROM (VALUES
  ('conventional', 'Conventional-01'),
  ('conventional-02', 'Conventional-02'),
  ('cnc', 'CNC-01'),
  ('forging', 'Forging')
) AS floor(code, name)
CROSS JOIN (VALUES ('read'), ('save')) AS action(name);

CREATE OR REPLACE VIEW reporting.production_session_summary AS
SELECT session.organization_id,
  floor.code AS production_floor_code,
  session.id,
  session.session_reference,
  session.status,
  session.production_date,
  session.shift,
  session.machine_number_snapshot AS machine_number,
  session.job_card_number_snapshot AS job_card_number,
  session.part_code_snapshot AS part_code,
  session.option_number_snapshot AS option_number,
  session.setup_number_snapshot AS setup_number,
  session.operator_code_snapshot AS operator_code,
  session.operator_name_snapshot AS operator_name,
  session.measurement_method,
  session.started_at,
  session.ended_at,
  session.end_reason,
  session.start_count,
  session.end_count,
  session.gross_weight_kg,
  session.crate_count,
  session.crate_weight_kg,
  session.net_weight_kg,
  session.piece_weight_grams,
  session.cycle_time_seconds,
  session.total_pieces,
  session.quantity_rejected,
  session.quantity_good,
  GREATEST(
    floor(extract(epoch FROM (COALESCE(session.ended_at, now()) - session.started_at)) / 60),
    0
  )::integer AS elapsed_minutes,
  COALESCE(downtime.minutes, 0)::integer AS downtime_minutes,
  CASE WHEN session.status = 'closed'
    AND session.source_payload ? 'runtimeMinutes'
    THEN (session.source_payload->>'runtimeMinutes')::integer
    ELSE GREATEST(
      floor(extract(epoch FROM (COALESCE(session.ended_at, now()) - session.started_at)) / 60)
        - COALESCE(downtime.minutes, 0),
      0
    )::integer
  END AS runtime_minutes,
  session.started_by_user_id,
  starter.name AS started_by_name,
  session.started_by_role,
  session.closed_by_user_id,
  closer.name AS closed_by_name,
  session.closed_by_role,
  session.created_at,
  session.updated_at
FROM manufacturing.production_sessions session
JOIN catalog.machines machine ON machine.id = session.machine_id
JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
LEFT JOIN identity.users starter ON starter.id = session.started_by_user_id
LEFT JOIN identity.users closer ON closer.id = session.closed_by_user_id
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(
    COALESCE(
      event.duration_minutes,
      GREATEST(floor(extract(epoch FROM (now() - event.started_at)) / 60), 0)::integer
    )
  ), 0) AS minutes
  FROM manufacturing.production_session_downtime_events event
  WHERE event.production_session_id = session.id
    AND event.reversed_at IS NULL
) downtime ON true
WHERE session.reversed_at IS NULL;
