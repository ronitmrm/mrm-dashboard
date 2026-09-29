ALTER TABLE manufacturing.production_session_downtime_events
  DROP CONSTRAINT production_session_downtime_events_entered_role_check,
  ADD CONSTRAINT production_session_downtime_events_entered_role_check
    CHECK (entered_role IN ('quality', 'shop_floor', 'machinist', 'authorized_staff'));

ALTER TABLE manufacturing.production_session_rejection_events
  DROP CONSTRAINT production_session_rejection_events_entered_role_check,
  ADD CONSTRAINT production_session_rejection_events_entered_role_check
    CHECK (entered_role IN ('quality', 'authorized_staff'));
