-- Restore source bulk-revision staging and the four-stage ECN workflow.

ALTER TABLE sales.bulk_price_revision_changes
  ADD COLUMN IF NOT EXISTS stage_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0
    CHECK (skipped_count >= 0),
  ADD COLUMN IF NOT EXISTS preview_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX bulk_price_revision_changes_stage_group_idx
  ON sales.bulk_price_revision_changes (
    bulk_price_revision_id, stage_group_id, created_at, id
  );

ALTER TABLE sales.engineering_change_notes
  ADD COLUMN IF NOT EXISTS product_costing_before jsonb,
  ADD COLUMN IF NOT EXISTS product_costing_after jsonb,
  ADD COLUMN IF NOT EXISTS product_costing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS affected_quote_item_ids_json jsonb
    NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE catalog.bom_lines
  ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 0
    CHECK (sequence >= 0);

CREATE INDEX bom_lines_parent_sequence_idx
  ON catalog.bom_lines (parent_item_id, sequence, created_at, id);
