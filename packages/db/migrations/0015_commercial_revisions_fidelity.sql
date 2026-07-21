-- Preserve the Pricing bulk-revision, ECN, and correction workflows.

ALTER TABLE sales.bulk_price_revisions
  ADD COLUMN IF NOT EXISTS customer_id uuid
    REFERENCES sales.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_route text NOT NULL
    DEFAULT 'Customer Parameter Bulk Revision',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE sales.bulk_price_revision_changes
  ALTER COLUMN prior_quote_item_id DROP NOT NULL,
  ALTER COLUMN old_price DROP NOT NULL,
  ALTER COLUMN new_price DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS field_name text,
  ADD COLUMN IF NOT EXISTS field_label text,
  ADD COLUMN IF NOT EXISTS new_value numeric(20,8),
  ADD COLUMN IF NOT EXISTS selection_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_quote_item_ids_json jsonb
    NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX bulk_price_revision_changes_revision_idx
  ON sales.bulk_price_revision_changes (
    bulk_price_revision_id, created_at, id
  );

ALTER TABLE sales.engineering_change_notes
  ADD COLUMN IF NOT EXISTS design_before jsonb,
  ADD COLUMN IF NOT EXISTS design_after jsonb,
  ADD COLUMN IF NOT EXISTS design_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE sales.engineering_change_decisions
  ADD COLUMN IF NOT EXISTS source_quote_item_id uuid
    REFERENCES sales.quote_items(id),
  ADD COLUMN IF NOT EXISTS replacement_quote_item_id uuid
    REFERENCES sales.quote_items(id),
  ADD COLUMN IF NOT EXISTS old_price numeric(18,6),
  ADD COLUMN IF NOT EXISTS new_price numeric(18,6),
  ADD COLUMN IF NOT EXISTS old_profit_percent numeric(20,8),
  ADD COLUMN IF NOT EXISTS new_profit_percent numeric(20,8),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE UNIQUE INDEX engineering_change_decisions_source_quote_unique
  ON sales.engineering_change_decisions (
    engineering_change_note_id, source_quote_item_id
  )
  WHERE source_quote_item_id IS NOT NULL;

CREATE TABLE audit.pricing_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  target_schema text NOT NULL DEFAULT 'sales',
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  requested_action text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'Quarantined'
    CHECK (status IN ('Quarantined', 'Resolved', 'Rejected')),
  resolution_event_id uuid REFERENCES audit.events(id),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  resolved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE INDEX pricing_correction_requests_status_idx
  ON audit.pricing_correction_requests (
    organization_id, status, created_at
  );

CREATE OR REPLACE FUNCTION sales.protect_completed_bulk_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_status text;
BEGIN
  SELECT status INTO revision_status
  FROM sales.bulk_price_revisions
  WHERE id = COALESCE(NEW.bulk_price_revision_id, OLD.bulk_price_revision_id);

  IF revision_status = 'Completed' THEN
    RAISE EXCEPTION 'Completed bulk revision changes are immutable.'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bulk_revision_changes_completed_immutable
  ON sales.bulk_price_revision_changes;
CREATE TRIGGER bulk_revision_changes_completed_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON sales.bulk_price_revision_changes
  FOR EACH ROW EXECUTE FUNCTION sales.protect_completed_bulk_revision();

CREATE OR REPLACE FUNCTION sales.protect_engineering_change_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ECN decisions are append-only.' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS engineering_change_decisions_append_only
  ON sales.engineering_change_decisions;
CREATE TRIGGER engineering_change_decisions_append_only
  BEFORE UPDATE OR DELETE ON sales.engineering_change_decisions
  FOR EACH ROW EXECUTE FUNCTION sales.protect_engineering_change_decision();
