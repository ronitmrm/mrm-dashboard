-- Pricing executable behavior permits one active nonblank customer code per
-- customer, regardless of product lineage. Preserve blank-code package-child
-- scope by its enquiry/product lineage.

WITH ranked AS (
  SELECT quote.id, quote.organization_id, quote.customer_id,
    quote.customer_part_code, quote.status, quote.revision,
    quote.price_lineage_key,
    first_value(quote.id) OVER (
      PARTITION BY quote.organization_id, quote.customer_id,
        lower(btrim(quote.customer_part_code))
      ORDER BY
        CASE WHEN quote.status = 'Accepted' THEN 0 ELSE 1 END,
        quote.revision DESC,
        quote.sent_at DESC NULLS LAST,
        quote.created_at DESC,
        quote.id DESC
    ) AS winner_id,
    row_number() OVER (
      PARTITION BY quote.organization_id, quote.customer_id,
        lower(btrim(quote.customer_part_code))
      ORDER BY
        CASE WHEN quote.status = 'Accepted' THEN 0 ELSE 1 END,
        quote.revision DESC,
        quote.sent_at DESC NULLS LAST,
        quote.created_at DESC,
        quote.id DESC
    ) AS source_rank
  FROM sales.quote_items quote
  WHERE quote.is_active
    AND nullif(btrim(quote.customer_part_code), '') IS NOT NULL
), losers AS (
  SELECT * FROM ranked WHERE source_rank > 1
)
INSERT INTO audit.events (
  organization_id, event_type, target_schema, target_table, target_id,
  reason, before_state, after_state, metadata,
  source_system, source_table, source_id
)
SELECT losers.organization_id, 'pricing.active_price_scope.normalized',
  'sales', 'quote_items', losers.id,
  'Applied current executable Pricing customer-code supersession scope.',
  jsonb_build_object(
    'isActive', true,
    'status', losers.status,
    'priceLineageKey', losers.price_lineage_key
  ),
  jsonb_build_object(
    'isActive', false,
    'status', 'Superseded',
    'supersededByQuoteItemId', losers.winner_id
  ),
  jsonb_build_object(
    'customerId', losers.customer_id,
    'customerPartCode', losers.customer_part_code,
    'sourceRank', losers.source_rank
  ),
  'mrm-dashboard', 'migration_0022', losers.id::text
FROM losers
ON CONFLICT (source_system, source_table, source_id) DO NOTHING;

WITH ranked AS (
  SELECT quote.id,
    first_value(quote.id) OVER (
      PARTITION BY quote.organization_id, quote.customer_id,
        lower(btrim(quote.customer_part_code))
      ORDER BY
        CASE WHEN quote.status = 'Accepted' THEN 0 ELSE 1 END,
        quote.revision DESC,
        quote.sent_at DESC NULLS LAST,
        quote.created_at DESC,
        quote.id DESC
    ) AS winner_id,
    row_number() OVER (
      PARTITION BY quote.organization_id, quote.customer_id,
        lower(btrim(quote.customer_part_code))
      ORDER BY
        CASE WHEN quote.status = 'Accepted' THEN 0 ELSE 1 END,
        quote.revision DESC,
        quote.sent_at DESC NULLS LAST,
        quote.created_at DESC,
        quote.id DESC
    ) AS source_rank
  FROM sales.quote_items quote
  WHERE quote.is_active
    AND nullif(btrim(quote.customer_part_code), '') IS NOT NULL
)
UPDATE sales.quote_items quote
SET status = 'Superseded',
  is_active = false,
  superseded_by_quote_item_id = ranked.winner_id,
  updated_at = now(),
  row_version = quote.row_version + 1
FROM ranked
WHERE quote.id = ranked.id
  AND ranked.source_rank > 1;

ALTER TABLE sales.quote_items DISABLE TRIGGER quote_items_sent_immutable;

UPDATE sales.quote_items
SET price_lineage_key = CASE
  WHEN nullif(btrim(customer_part_code), '') IS NOT NULL
    THEN 'code:' || lower(btrim(customer_part_code))
  ELSE 'enquiry:' || coalesce(enquiry_id::text, 'none') || ':' || item_id::text
END
WHERE price_lineage_key IS DISTINCT FROM CASE
  WHEN nullif(btrim(customer_part_code), '') IS NOT NULL
    THEN 'code:' || lower(btrim(customer_part_code))
  ELSE 'enquiry:' || coalesce(enquiry_id::text, 'none') || ':' || item_id::text
END;

ALTER TABLE sales.quote_items ENABLE TRIGGER quote_items_sent_immutable;

DROP INDEX IF EXISTS sales.quote_items_active_price_unique;
DROP INDEX IF EXISTS sales.quote_items_one_active_lineage;

CREATE UNIQUE INDEX quote_items_active_price_unique
  ON sales.quote_items (
    organization_id,
    customer_id,
    lower(btrim(customer_part_code))
  )
  WHERE is_active
    AND nullif(btrim(customer_part_code), '') IS NOT NULL;

CREATE UNIQUE INDEX quote_items_active_blank_child_unique
  ON sales.quote_items (organization_id, customer_id, price_lineage_key)
  WHERE is_active
    AND nullif(btrim(customer_part_code), '') IS NULL;
