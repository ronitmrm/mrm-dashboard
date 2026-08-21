ALTER TABLE sales.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_status_check;

ALTER TABLE sales.quote_items
  ADD CONSTRAINT quote_items_status_check
  CHECK (
    status IN (
      'Draft', 'Ready', 'Sent', 'Accepted', 'Ordered', 'Superseded',
      'Cancelled'
    )
  );

CREATE INDEX IF NOT EXISTS quote_items_customer_costing_queue_idx
  ON sales.quote_items (organization_id, enquiry_item_id, updated_at DESC)
  WHERE status IN ('Draft', 'Ready');

DROP INDEX IF EXISTS sales.quote_items_match_candidates_idx;
CREATE INDEX quote_items_match_candidates_idx
  ON sales.quote_items (
    organization_id, customer_id, sent_at DESC NULLS LAST,
    updated_at DESC, id DESC
  )
  INCLUDE (
    status, customer_part_code, item_id, quote_number, revision, unit_price
  )
  WHERE status IN ('Draft', 'Ready', 'Sent', 'Accepted', 'Ordered');
