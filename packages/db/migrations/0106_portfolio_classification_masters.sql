-- Make every classification already displayed by the permanent Product
-- Portfolio available in the editable Design Category and Subcategory masters.
-- Re-running this migration is safe because master names are organization scoped.

WITH portfolio_classifications AS (
  SELECT
    item.organization_id,
    COALESCE(
      NULLIF(btrim(profile.category), ''),
      NULLIF(btrim(item.source_payload ->> 'category'), ''),
      NULLIF(btrim(design.internal_part_category), '')
    ) AS category
  FROM catalog.items item
  LEFT JOIN catalog.website_product_profiles profile
    ON profile.item_id = item.id
  LEFT JOIN sales.design_tasks design
    ON design.id::text = item.source_payload ->> 'designTaskId'
  WHERE item.uid_kind = 'INTERNAL'
    AND item.lifecycle_status = 'P'
), portfolio_categories AS (
  SELECT
    organization_id,
    min(category) AS name,
    lower(category) AS normalized_name
  FROM portfolio_classifications
  WHERE category IS NOT NULL
  GROUP BY organization_id, lower(category)
)
INSERT INTO catalog.item_categories (
  organization_id,
  name,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  organization_id,
  name,
  'product-portfolio-backfill',
  'catalog.items',
  organization_id::text || ':category:' || md5(normalized_name),
  jsonb_build_object(
    'derivedFrom', 'Current Product Portfolio',
    'classification', 'Category'
  )
FROM portfolio_categories
ON CONFLICT DO NOTHING;

WITH portfolio_classifications AS (
  SELECT
    item.organization_id,
    COALESCE(
      NULLIF(btrim(profile.category), ''),
      NULLIF(btrim(item.source_payload ->> 'category'), ''),
      NULLIF(btrim(design.internal_part_category), '')
    ) AS category,
    COALESCE(
      NULLIF(btrim(profile.sub_category), ''),
      NULLIF(btrim(item.source_payload ->> 'subcategory'), ''),
      NULLIF(btrim(design.internal_part_sub_category), '')
    ) AS subcategory
  FROM catalog.items item
  LEFT JOIN catalog.website_product_profiles profile
    ON profile.item_id = item.id
  LEFT JOIN sales.design_tasks design
    ON design.id::text = item.source_payload ->> 'designTaskId'
  WHERE item.uid_kind = 'INTERNAL'
    AND item.lifecycle_status = 'P'
), portfolio_subcategories AS (
  SELECT
    organization_id,
    min(category) AS category,
    min(subcategory) AS name,
    lower(category) AS normalized_category,
    lower(subcategory) AS normalized_name
  FROM portfolio_classifications
  WHERE category IS NOT NULL
    AND subcategory IS NOT NULL
  GROUP BY organization_id, lower(category), lower(subcategory)
)
INSERT INTO catalog.item_subcategories (
  organization_id,
  category_id,
  name,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  portfolio.organization_id,
  category.id,
  portfolio.name,
  'product-portfolio-backfill',
  'catalog.items',
  portfolio.organization_id::text || ':subcategory:' ||
    md5(portfolio.normalized_category || ':' || portfolio.normalized_name),
  jsonb_build_object(
    'derivedFrom', 'Current Product Portfolio',
    'classification', 'Subcategory',
    'category', portfolio.category
  )
FROM portfolio_subcategories portfolio
JOIN catalog.item_categories category
  ON category.organization_id = portfolio.organization_id
 AND lower(btrim(category.name)) = portfolio.normalized_category
ON CONFLICT DO NOTHING;
