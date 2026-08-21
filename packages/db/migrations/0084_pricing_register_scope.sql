-- Keep the bounded Pricing register and its server search index-backed.

CREATE INDEX IF NOT EXISTS quote_items_pricing_register_scope_idx
  ON sales.quote_items (
    organization_id, customer_id, customer_part_code, revision DESC, id
  )
  INCLUDE (item_id, status, is_active, quote_number)
  WHERE status IN ('Draft', 'Ready') OR is_active;

CREATE INDEX IF NOT EXISTS customers_pricing_search_trgm_idx
  ON sales.customers USING gin (
    (lower(company_name || ' ' || customer_uid)) gin_trgm_ops
  );
