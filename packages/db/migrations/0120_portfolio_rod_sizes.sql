-- Read the permanent internal portfolio directly. Customer codes, aliases,
-- customer prices and quote membership must never be prerequisites.
INSERT INTO catalog.rod_sizes (
  organization_id, name, source_system, source_table, source_id, source_payload
)
SELECT organization_id, min(btrim(rod_size)),
  'product-portfolio-backfill', 'catalog.items',
  organization_id::text || ':rod-size:' || md5(lower(btrim(rod_size))),
  jsonb_build_object('derivedFrom', 'Current Product Portfolio', 'classification', 'Rod Size')
FROM catalog.items
WHERE uid_kind = 'INTERNAL' AND lifecycle_status = 'P'
  AND nullif(btrim(rod_size), '') IS NOT NULL
GROUP BY organization_id, lower(btrim(rod_size))
ON CONFLICT DO NOTHING;
