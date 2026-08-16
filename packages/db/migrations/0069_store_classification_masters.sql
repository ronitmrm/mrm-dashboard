CREATE TABLE store.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_asset_categories_name_unique
  ON store.asset_categories (organization_id, lower(name));

CREATE TABLE store.asset_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  category_id uuid NOT NULL REFERENCES store.asset_categories(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_asset_subcategories_name_unique
  ON store.asset_subcategories (organization_id, category_id, lower(name));

CREATE TABLE store.asset_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  subcategory_id uuid NOT NULL REFERENCES store.asset_subcategories(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX store_asset_names_name_unique
  ON store.asset_names (organization_id, subcategory_id, lower(name));

INSERT INTO store.asset_categories (organization_id, name)
SELECT DISTINCT ON (source.organization_id, lower(source.name))
  source.organization_id, source.name
FROM (
  SELECT organization_id, btrim(asset_category) AS name
  FROM store.item_types
  UNION ALL
  SELECT organization_id, btrim(requested_category) AS name
  FROM store.code_requests
) AS source
ORDER BY source.organization_id, lower(source.name), source.name
ON CONFLICT (organization_id, lower(name)) DO NOTHING;

INSERT INTO store.asset_subcategories (organization_id, category_id, name)
SELECT DISTINCT ON (
    source.organization_id, category.id, lower(source.subcategory)
  )
  source.organization_id, category.id, source.subcategory
FROM (
  SELECT organization_id, btrim(asset_category) AS category,
    btrim(asset_subcategory) AS subcategory
  FROM store.item_types
  UNION ALL
  SELECT organization_id, btrim(requested_category) AS category,
    btrim(requested_subcategory) AS subcategory
  FROM store.code_requests
) AS source
JOIN store.asset_categories category
  ON category.organization_id = source.organization_id
  AND lower(category.name) = lower(source.category)
ORDER BY source.organization_id, category.id, lower(source.subcategory),
  source.subcategory
ON CONFLICT (organization_id, category_id, lower(name)) DO NOTHING;

INSERT INTO store.asset_names (organization_id, subcategory_id, name)
SELECT DISTINCT ON (
    source.organization_id, subcategory.id, lower(source.asset_name)
  )
  source.organization_id, subcategory.id, source.asset_name
FROM (
  SELECT organization_id, btrim(asset_category) AS category,
    btrim(asset_subcategory) AS subcategory, btrim(asset_name) AS asset_name
  FROM store.item_types
  UNION ALL
  SELECT organization_id, btrim(requested_category) AS category,
    btrim(requested_subcategory) AS subcategory,
    btrim(requested_asset_name) AS asset_name
  FROM store.code_requests
) AS source
JOIN store.asset_categories category
  ON category.organization_id = source.organization_id
  AND lower(category.name) = lower(source.category)
JOIN store.asset_subcategories subcategory
  ON subcategory.organization_id = source.organization_id
  AND subcategory.category_id = category.id
  AND lower(subcategory.name) = lower(source.subcategory)
ORDER BY source.organization_id, subcategory.id, lower(source.asset_name),
  source.asset_name
ON CONFLICT (organization_id, subcategory_id, lower(name)) DO NOTHING;

ALTER TABLE store.item_types
  ADD COLUMN asset_category_id uuid REFERENCES store.asset_categories(id),
  ADD COLUMN asset_subcategory_id uuid REFERENCES store.asset_subcategories(id),
  ADD COLUMN asset_name_id uuid REFERENCES store.asset_names(id);

UPDATE store.item_types item
SET asset_category_id = category.id,
  asset_subcategory_id = subcategory.id,
  asset_name_id = asset_name.id
FROM store.asset_categories category
JOIN store.asset_subcategories subcategory
  ON subcategory.category_id = category.id
JOIN store.asset_names asset_name
  ON asset_name.subcategory_id = subcategory.id
WHERE category.organization_id = item.organization_id
  AND subcategory.organization_id = item.organization_id
  AND asset_name.organization_id = item.organization_id
  AND lower(category.name) = lower(item.asset_category)
  AND lower(subcategory.name) = lower(item.asset_subcategory)
  AND lower(asset_name.name) = lower(item.asset_name);

ALTER TABLE store.item_types
  ALTER COLUMN asset_category_id SET NOT NULL,
  ALTER COLUMN asset_subcategory_id SET NOT NULL,
  ALTER COLUMN asset_name_id SET NOT NULL;

ALTER TABLE store.code_requests
  ADD COLUMN requested_category_id uuid REFERENCES store.asset_categories(id),
  ADD COLUMN requested_subcategory_id uuid REFERENCES store.asset_subcategories(id),
  ADD COLUMN requested_asset_name_id uuid REFERENCES store.asset_names(id);

UPDATE store.code_requests request
SET requested_category_id = category.id,
  requested_subcategory_id = subcategory.id,
  requested_asset_name_id = asset_name.id
FROM store.asset_categories category
JOIN store.asset_subcategories subcategory
  ON subcategory.category_id = category.id
JOIN store.asset_names asset_name
  ON asset_name.subcategory_id = subcategory.id
WHERE category.organization_id = request.organization_id
  AND subcategory.organization_id = request.organization_id
  AND asset_name.organization_id = request.organization_id
  AND lower(category.name) = lower(request.requested_category)
  AND lower(subcategory.name) = lower(request.requested_subcategory)
  AND lower(asset_name.name) = lower(request.requested_asset_name);

ALTER TABLE store.code_requests
  ALTER COLUMN requested_category_id SET NOT NULL,
  ALTER COLUMN requested_subcategory_id SET NOT NULL,
  ALTER COLUMN requested_asset_name_id SET NOT NULL;

INSERT INTO store.number_counters (
  organization_id, counter_key, counter_year, current_value
)
SELECT organization_id, 'TYPE_CODE', 0,
  max(substring(type_code FROM 3)::integer)
FROM store.item_types
WHERE type_code ~ '^ST[0-9]+$'
GROUP BY organization_id
ON CONFLICT (organization_id, counter_key, counter_year)
DO UPDATE SET current_value = greatest(
  store.number_counters.current_value,
  EXCLUDED.current_value
);

GRANT SELECT, INSERT, UPDATE ON
  store.asset_categories, store.asset_subcategories, store.asset_names
TO mrmpl_web;
GRANT SELECT ON
  store.asset_categories, store.asset_subcategories, store.asset_names
TO mrmpl_worker, mrmpl_reporting;
