-- Keep cross-customer Product Bulk Revision expansion index-backed.

CREATE INDEX IF NOT EXISTS quote_items_product_bulk_scope_idx
  ON sales.quote_items (
    organization_id, item_id, updated_at DESC, id DESC
  )
  WHERE is_active AND status IN ('Sent', 'Accepted');
