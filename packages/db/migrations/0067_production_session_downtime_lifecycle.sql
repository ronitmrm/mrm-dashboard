ALTER TABLE manufacturing.production_session_downtime_events
  ADD COLUMN end_outcome text,
  ADD COLUMN carry_forward_resolved_at timestamptz,
  ADD COLUMN carry_forward_resolved_by_user_id uuid
    REFERENCES identity.users(id) ON DELETE SET NULL;

UPDATE manufacturing.production_session_downtime_events
SET end_outcome = 'resolved'
WHERE ended_at IS NOT NULL;

ALTER TABLE manufacturing.production_session_downtime_events
  ADD CONSTRAINT production_session_downtime_outcome_valid CHECK (
    (ended_at IS NULL AND end_outcome IS NULL)
    OR (
      ended_at IS NOT NULL
      AND end_outcome IN ('resolved', 'shift_end_unresolved')
    )
  ),
  ADD CONSTRAINT production_session_downtime_carry_resolution_valid CHECK (
    (
      carry_forward_resolved_at IS NULL
      AND carry_forward_resolved_by_user_id IS NULL
    )
    OR (
      end_outcome = 'shift_end_unresolved'
      AND carry_forward_resolved_at >= ended_at
    )
  );

CREATE INDEX production_session_unresolved_downtime_idx
  ON manufacturing.production_session_downtime_events (
    organization_id, ended_at DESC
  )
  WHERE end_outcome = 'shift_end_unresolved'
    AND carry_forward_resolved_at IS NULL
    AND reversed_at IS NULL;
