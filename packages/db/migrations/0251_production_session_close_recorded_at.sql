ALTER TABLE manufacturing.production_sessions
  ADD COLUMN closed_recorded_at timestamptz;

-- Older closes keep NULL: updated_at moves on later edits, so it is not the entry time.

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
  session.closed_recorded_at
FROM manufacturing.production_sessions session
JOIN catalog.machines machine ON machine.id = session.machine_id
JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
LEFT JOIN identity.users closer ON closer.id = session.closed_by_user_id
WHERE session.reversed_at IS NULL AND session.status = 'closed';


-- Stage events can carry a user-entered occurred_at; keep the save time too.
-- Added without a default first so older rows stay NULL instead of the migration time.
ALTER TABLE manufacturing.shop_floor_stage_events
  ADD COLUMN recorded_at timestamptz;
ALTER TABLE manufacturing.shop_floor_stage_events
  ALTER COLUMN recorded_at SET DEFAULT now();
