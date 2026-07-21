CREATE INDEX IF NOT EXISTS production_entries_active_work_order_idx
  ON manufacturing.production_entries (work_order_id, production_date, recorded_at DESC)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS production_card_events_card_time_idx
  ON manufacturing.production_card_events (production_card_id, event_at DESC)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS shop_floor_stage_events_state_time_idx
  ON manufacturing.shop_floor_stage_events (setup_state_id, occurred_at DESC)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS dispatch_approval_events_work_order_time_idx
  ON manufacturing.dispatch_approval_events (work_order_id, occurred_at DESC)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS setup_completion_events_work_order_time_idx
  ON manufacturing.setup_completion_events (work_order_id, completed_at DESC)
  WHERE reversed_at IS NULL;
