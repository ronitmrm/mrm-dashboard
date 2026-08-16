ALTER TABLE manufacturing.production_sessions
  DROP CONSTRAINT production_sessions_end_reason_check;

ALTER TABLE manufacturing.production_sessions
  ADD CONSTRAINT production_sessions_end_reason_check CHECK (
    end_reason IS NULL OR end_reason IN (
      'operator_change', 'shift_end', 'shift_change', 'item_complete',
      'job_change', 'manual_stop'
    )
  );
