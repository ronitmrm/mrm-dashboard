ALTER TABLE manufacturing.production_sessions
  ADD COLUMN session_reference text,
  ADD COLUMN daily_sequence integer,
  ADD COLUMN machine_number_snapshot text,
  ADD COLUMN job_card_number_snapshot text,
  ADD COLUMN part_code_snapshot text,
  ADD COLUMN option_number_snapshot text,
  ADD COLUMN setup_number_snapshot text,
  ADD COLUMN operator_code_snapshot text,
  ADD COLUMN operator_name_snapshot text,
  ADD COLUMN cycle_time_seconds numeric(20,3) NOT NULL DEFAULT 0,
  ADD COLUMN started_by_role text NOT NULL DEFAULT 'shop_floor',
  ADD COLUMN closed_by_role text;

UPDATE manufacturing.production_sessions session
SET machine_number_snapshot = machine.machine_number,
  job_card_number_snapshot = work_order.job_card_number,
  part_code_snapshot = item.uid,
  option_number_snapshot = route.route_code,
  setup_number_snapshot = setup.setup_number::text,
  operator_code_snapshot = employee.employee_code,
  operator_name_snapshot = employee.name,
  cycle_time_seconds = GREATEST(
    COALESCE(migration.try_numeric(session.source_payload->>'cycleTime'), 0),
    0
  )
FROM manufacturing.work_orders work_order,
  catalog.items item,
  manufacturing.route_options route,
  manufacturing.operation_setups setup,
  catalog.machines machine,
  workforce.employees employee
WHERE work_order.id = session.work_order_id
  AND item.id = work_order.item_id
  AND route.id = session.route_option_id
  AND setup.id = session.operation_setup_id
  AND machine.id = session.machine_id
  AND employee.id = session.operator_employee_id;

WITH numbered AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY machine_id, production_date
      ORDER BY started_at, created_at, id
    )::integer AS daily_sequence
  FROM manufacturing.production_sessions
)
UPDATE manufacturing.production_sessions session
SET daily_sequence = numbered.daily_sequence
FROM numbered
WHERE numbered.id = session.id;

UPDATE manufacturing.production_sessions
SET session_reference = upper(machine_number_snapshot) || '-' ||
  to_char(production_date, 'YYYYMMDD') || '-' ||
  lpad(daily_sequence::text, 2, '0');

ALTER TABLE manufacturing.production_sessions
  ALTER COLUMN session_reference SET NOT NULL,
  ALTER COLUMN daily_sequence SET NOT NULL,
  ALTER COLUMN machine_number_snapshot SET NOT NULL,
  ALTER COLUMN job_card_number_snapshot SET NOT NULL,
  ALTER COLUMN part_code_snapshot SET NOT NULL,
  ALTER COLUMN option_number_snapshot SET NOT NULL,
  ALTER COLUMN setup_number_snapshot SET NOT NULL,
  ALTER COLUMN operator_code_snapshot SET NOT NULL,
  ALTER COLUMN operator_name_snapshot SET NOT NULL,
  ADD CONSTRAINT production_sessions_daily_sequence_positive
    CHECK (daily_sequence > 0),
  ADD CONSTRAINT production_sessions_started_role_valid
    CHECK (started_by_role = 'shop_floor'),
  ADD CONSTRAINT production_sessions_closed_role_valid
    CHECK (closed_by_role IS NULL OR closed_by_role IN ('shop_floor', 'quality'));

CREATE UNIQUE INDEX production_sessions_reference_unique
  ON manufacturing.production_sessions (organization_id, lower(session_reference));

CREATE UNIQUE INDEX production_sessions_machine_day_sequence_unique
  ON manufacturing.production_sessions (machine_id, production_date, daily_sequence);

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_name
    FROM information_schema.check_constraints
    WHERE constraint_schema = 'manufacturing'
      AND constraint_name IN (
        'production_session_downtime_events_duration_minutes_check',
        'production_session_downtime_events_check'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE manufacturing.production_session_downtime_events DROP CONSTRAINT %I',
      constraint_row.constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE manufacturing.production_session_downtime_events
  ALTER COLUMN ended_at DROP NOT NULL,
  ALTER COLUMN duration_minutes DROP NOT NULL,
  ADD COLUMN ended_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT production_session_downtime_end_after_start
    CHECK (ended_at IS NULL OR ended_at > started_at),
  ADD CONSTRAINT production_session_downtime_lifecycle_valid
    CHECK (
      (ended_at IS NULL AND duration_minutes IS NULL)
      OR (ended_at IS NOT NULL AND duration_minutes > 0)
    );

CREATE UNIQUE INDEX production_session_one_open_downtime_unique
  ON manufacturing.production_session_downtime_events (production_session_id)
  WHERE ended_at IS NULL AND reversed_at IS NULL;

CREATE SCHEMA IF NOT EXISTS reporting;

CREATE OR REPLACE VIEW reporting.daily_machine_status AS
SELECT machine.organization_id,
  floor.code AS production_floor_code,
  machine.id AS machine_id,
  machine.machine_number,
  session.id AS production_session_id,
  session.session_reference,
  session.status AS session_status,
  session.production_date,
  session.shift,
  session.job_card_number_snapshot,
  session.part_code_snapshot,
  session.option_number_snapshot,
  session.setup_number_snapshot,
  session.operator_code_snapshot,
  session.operator_name_snapshot,
  session.started_at,
  downtime.id AS open_downtime_id,
  downtime.reason_code AS open_downtime_reason_code,
  downtime.reason_name AS open_downtime_reason_name,
  downtime.started_at AS open_downtime_started_at
FROM catalog.machines machine
JOIN manufacturing.production_floors floor
  ON floor.id = machine.production_floor_id
LEFT JOIN manufacturing.production_sessions session
  ON session.machine_id = machine.id
  AND session.status = 'open'
  AND session.reversed_at IS NULL
LEFT JOIN manufacturing.production_session_downtime_events downtime
  ON downtime.production_session_id = session.id
  AND downtime.ended_at IS NULL
  AND downtime.reversed_at IS NULL
WHERE machine.active;

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
  GREATEST(
    floor(extract(epoch FROM (COALESCE(session.ended_at, now()) - session.started_at)) / 60)
      - COALESCE(downtime.minutes, 0),
    0
  )::integer AS runtime_minutes,
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

CREATE OR REPLACE VIEW reporting.production_event_log AS
SELECT session.organization_id,
  floor.code AS production_floor_code,
  session.id AS production_session_id,
  session.session_reference,
  session.production_date,
  session.shift,
  session.machine_number_snapshot AS machine_number,
  session.job_card_number_snapshot AS job_card_number,
  session.part_code_snapshot AS part_code,
  session.option_number_snapshot AS option_number,
  session.setup_number_snapshot AS setup_number,
  session.operator_code_snapshot AS operator_code,
  session.operator_name_snapshot AS operator_name,
  'session_started'::text AS event_type,
  session.started_at AS event_time,
  session.started_at,
  NULL::timestamptz AS ended_at,
  NULL::integer AS duration_minutes,
  NULL::text AS reason_code,
  'Production started'::text AS reason_name,
  NULL::integer AS quantity,
  session.started_by_user_id AS entered_by_user_id,
  starter.name AS entered_by_name,
  session.started_by_role AS entered_role,
  session.created_at AS recorded_at
FROM manufacturing.production_sessions session
JOIN catalog.machines machine ON machine.id = session.machine_id
JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
LEFT JOIN identity.users starter ON starter.id = session.started_by_user_id
WHERE session.reversed_at IS NULL
UNION ALL
SELECT session.organization_id, floor.code, session.id,
  session.session_reference, session.production_date, session.shift,
  session.machine_number_snapshot, session.job_card_number_snapshot,
  session.part_code_snapshot, session.option_number_snapshot,
  session.setup_number_snapshot, session.operator_code_snapshot,
  session.operator_name_snapshot,
  CASE WHEN downtime.ended_at IS NULL THEN 'downtime_started' ELSE 'downtime' END,
  downtime.started_at, downtime.started_at, downtime.ended_at,
  downtime.duration_minutes, downtime.reason_code, downtime.reason_name,
  NULL::integer, downtime.entered_by_user_id, entrant.name,
  downtime.entered_role, downtime.recorded_at
FROM manufacturing.production_session_downtime_events downtime
JOIN manufacturing.production_sessions session
  ON session.id = downtime.production_session_id
JOIN catalog.machines machine ON machine.id = session.machine_id
JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
LEFT JOIN identity.users entrant ON entrant.id = downtime.entered_by_user_id
WHERE session.reversed_at IS NULL AND downtime.reversed_at IS NULL
UNION ALL
SELECT session.organization_id, floor.code, session.id,
  session.session_reference, session.production_date, session.shift,
  session.machine_number_snapshot, session.job_card_number_snapshot,
  session.part_code_snapshot, session.option_number_snapshot,
  session.setup_number_snapshot, session.operator_code_snapshot,
  session.operator_name_snapshot, 'rejection', rejection.recorded_at,
  rejection.recorded_at, NULL::timestamptz, NULL::integer,
  rejection.reason_code,
  rejection.type_name || ' · ' || rejection.reason_name || ' · ' || rejection.remark_name,
  rejection.quantity, rejection.entered_by_user_id, entrant.name,
  rejection.entered_role, rejection.recorded_at
FROM manufacturing.production_session_rejection_events rejection
JOIN manufacturing.production_sessions session
  ON session.id = rejection.production_session_id
JOIN catalog.machines machine ON machine.id = session.machine_id
JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
LEFT JOIN identity.users entrant ON entrant.id = rejection.entered_by_user_id
WHERE session.reversed_at IS NULL AND rejection.reversed_at IS NULL
UNION ALL
SELECT session.organization_id, floor.code, session.id,
  session.session_reference, session.production_date, session.shift,
  session.machine_number_snapshot, session.job_card_number_snapshot,
  session.part_code_snapshot, session.option_number_snapshot,
  session.setup_number_snapshot, session.operator_code_snapshot,
  session.operator_name_snapshot, 'session_closed', session.ended_at,
  session.ended_at, session.ended_at, NULL::integer, session.end_reason,
  'Production session closed', session.quantity_good,
  session.closed_by_user_id, closer.name, session.closed_by_role,
  session.updated_at
FROM manufacturing.production_sessions session
JOIN catalog.machines machine ON machine.id = session.machine_id
JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
LEFT JOIN identity.users closer ON closer.id = session.closed_by_user_id
WHERE session.reversed_at IS NULL AND session.status = 'closed';

GRANT SELECT ON
  reporting.daily_machine_status,
  reporting.production_session_summary,
  reporting.production_event_log
TO mrmpl_web, mrmpl_worker, mrmpl_reporting;

GRANT USAGE ON SCHEMA reporting
TO mrmpl_web, mrmpl_worker, mrmpl_reporting;
