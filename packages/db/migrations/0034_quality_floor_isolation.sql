DROP INDEX quality.first_piece_inspections_active_key_unique;

CREATE UNIQUE INDEX first_piece_inspections_active_key_unique
  ON quality.first_piece_inspections (
    organization_id,
    operation_setup_id,
    lower(check_key)
  )
  WHERE reversed_at IS NULL;

DROP INDEX quality.hourly_checks_active_key_unique;

CREATE UNIQUE INDEX hourly_checks_active_key_unique
  ON quality.hourly_checks (
    organization_id,
    operation_setup_id,
    lower(check_key)
  )
  WHERE reversed_at IS NULL;

DROP INDEX quality.setup_checklist_sessions_active_key_unique;

CREATE UNIQUE INDEX setup_checklist_sessions_active_key_unique
  ON quality.setup_checklist_sessions (
    organization_id,
    operation_setup_id,
    lower(session_key)
  )
  WHERE reversed_at IS NULL;
