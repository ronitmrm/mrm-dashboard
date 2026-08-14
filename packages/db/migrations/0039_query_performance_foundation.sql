-- Bounded hot-path indexes for worker claims, operational projections, and
-- commercial queues. These are deliberately partial/composite to limit write
-- amplification as append-heavy tables grow.

CREATE INDEX IF NOT EXISTS refresh_jobs_pending_claim_idx
  ON derived.refresh_jobs (run_after, queue_key, created_at, id)
  WHERE status = 'pending';

-- Wake workers after durable dashboard work commits. The notification carries
-- routing data only; derived.refresh_jobs remains the work authority.
CREATE FUNCTION derived.notify_dashboard_refresh_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.queue_key = 'dashboard'
    AND NEW.status IN ('pending', 'running') THEN
    PERFORM pg_notify(
      'mrm_dashboard_refresh',
      json_build_object(
        'v', 1,
        'organizationId', NEW.organization_id::text,
        'queueKey', NEW.queue_key
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_jobs_notify_dashboard
AFTER INSERT OR UPDATE OF run_after ON derived.refresh_jobs
FOR EACH ROW
EXECUTE FUNCTION derived.notify_dashboard_refresh_job();

CREATE INDEX IF NOT EXISTS production_entries_dashboard_source_idx
  ON manufacturing.production_entries (
    organization_id, recorded_at DESC, source_id DESC
  )
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS shop_floor_events_dashboard_source_idx
  ON manufacturing.shop_floor_stage_events (
    organization_id, occurred_at DESC, source_id DESC
  )
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS hourly_checks_dashboard_source_idx
  ON quality.hourly_checks (
    organization_id, checked_at DESC, source_id DESC
  )
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS planner_priority_dashboard_source_idx
  ON manufacturing.planner_priority_events (
    organization_id, occurred_at DESC, source_id DESC
  )
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS plan_override_dashboard_source_idx
  ON manufacturing.plan_override_events (
    organization_id, occurred_at DESC, source_id DESC
  )
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS route_change_dashboard_source_idx
  ON manufacturing.route_change_events (
    organization_id, occurred_at DESC, source_id DESC
  )
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS dispatch_approval_dashboard_source_idx
  ON manufacturing.dispatch_approval_events (
    organization_id, occurred_at DESC, source_id DESC
  )
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS file_links_batched_target_idx
  ON core.file_links (
    organization_id, target_schema, target_table, target_id, purpose,
    created_at DESC
  )
  INCLUDE (file_id);

CREATE INDEX IF NOT EXISTS clarification_tasks_open_queue_idx
  ON sales.clarification_tasks (
    organization_id, target_stage, created_at, id
  )
  INCLUDE (enquiry_id, enquiry_item_id)
  WHERE status = 'Open';

CREATE INDEX IF NOT EXISTS quote_items_match_candidates_idx
  ON sales.quote_items (
    organization_id, customer_id, sent_at DESC NULLS LAST,
    updated_at DESC, id DESC
  )
  INCLUDE (
    status, customer_part_code, item_id, quote_number, revision, unit_price
  )
  WHERE status IN ('Draft', 'Sent', 'Accepted', 'Ordered');

CREATE INDEX IF NOT EXISTS purchase_orders_timeline_idx
  ON sales.purchase_orders (organization_id, po_date DESC, id DESC)
  INCLUDE (customer_id, status, po_number, total_amount, currency_code);

CREATE INDEX IF NOT EXISTS engineering_change_notes_queue_idx
  ON sales.engineering_change_notes (
    organization_id, status, updated_at DESC, id DESC
  )
  INCLUDE (item_id, ecn_number, effective_on);

CREATE INDEX IF NOT EXISTS engineering_change_decisions_source_idx
  ON sales.engineering_change_decisions (
    engineering_change_note_id, source_quote_item_id
  );

CREATE INDEX IF NOT EXISTS enquiries_timeline_idx
  ON sales.enquiries (organization_id, received_on DESC, id DESC)
  INCLUDE (customer_id, status, enquiry_number, priority);

CREATE INDEX IF NOT EXISTS followups_open_queue_idx
  ON sales.followups (organization_id, due_on, id)
  INCLUDE (enquiry_id, quote_item_id, channel)
  WHERE status = 'Pending';
