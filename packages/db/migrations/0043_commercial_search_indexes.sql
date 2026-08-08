-- Trigram indexes keep contains-search bounded as the commercial catalog grows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS quote_items_commercial_search_trgm_idx
  ON sales.quote_items USING gin (
    (lower(
      btrim(coalesce(customer_part_code, '')) || ' ' || btrim(quote_number)
    )) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS quote_items_customer_part_exact_idx
  ON sales.quote_items (
    organization_id, customer_id,
    (lower(btrim(coalesce(customer_part_code, '')))),
    sent_at DESC NULLS LAST, updated_at DESC, id DESC
  );

CREATE INDEX IF NOT EXISTS quote_items_quote_number_exact_idx
  ON sales.quote_items (
    organization_id, customer_id, (lower(btrim(quote_number))),
    sent_at DESC NULLS LAST, updated_at DESC, id DESC
  );

CREATE INDEX IF NOT EXISTS items_commercial_search_trgm_idx
  ON catalog.items USING gin (
    (lower(coalesce(uid, '') || ' ' || coalesce(description, ''))) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS drawings_commercial_search_trgm_idx
  ON catalog.drawings USING gin (
    (lower(coalesce(drawing_number, '') || ' ' || coalesce(remarks, '')))
      gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS website_profiles_commercial_search_trgm_idx
  ON catalog.website_product_profiles USING gin (
    (lower(
      coalesce(part_code, '') || ' ' ||
      coalesce(product_description, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(sub_category, '') || ' ' ||
      coalesce(grade, '')
    )) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS drawings_operational_filter_idx
  ON catalog.drawings (organization_id, revision, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS website_profiles_operational_filter_idx
  ON catalog.website_product_profiles (
    organization_id, is_active, website_status, category, id
  );
