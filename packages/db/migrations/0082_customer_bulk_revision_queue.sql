-- Keep the dedicated Customer Bulk Revision queue bounded as revision history grows.

CREATE INDEX IF NOT EXISTS bulk_price_revisions_customer_queue_idx
  ON sales.bulk_price_revisions (
    organization_id, revision_route, status, created_at DESC, id DESC
  )
  INCLUDE (customer_id, revision_number, effective_on)
  WHERE status <> 'Completed';
