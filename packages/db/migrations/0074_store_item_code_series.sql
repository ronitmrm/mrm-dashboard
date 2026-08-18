-- Normalize every Store Item Type into independent Consumable and
-- Non Consumable Asset Code series. Canonical relationships use UUIDs, so the
-- one-time code replacement preserves transactional and maintenance history.

CREATE TEMP TABLE store_item_code_migration ON COMMIT DROP AS
SELECT item.id AS item_type_id,
  item.organization_id,
  item.type_code AS old_type_code,
  CASE item.tracking_mode
    WHEN 'CONSUMABLE' THEN 'C'
    ELSE 'NC'
  END || lpad(
    row_number() OVER (
      PARTITION BY item.organization_id, item.tracking_mode
      ORDER BY item.created_at, item.id
    )::text,
    3,
    '0'
  ) AS new_type_code,
  item.tracking_mode
FROM store.item_types item;

CREATE UNIQUE INDEX store_item_code_migration_item_unique
  ON store_item_code_migration (item_type_id);
CREATE UNIQUE INDEX store_item_code_migration_code_unique
  ON store_item_code_migration (organization_id, lower(new_type_code));

CREATE TEMP TABLE store_asset_code_migration ON COMMIT DROP AS
SELECT asset.id AS asset_id,
  mapping.new_type_code || '-' || lpad(
    row_number() OVER (
      PARTITION BY asset.item_type_id
      ORDER BY asset.created_at, asset.id
    )::text,
    4,
    '0'
  ) AS new_asset_code
FROM store.assets asset
JOIN store_item_code_migration mapping
  ON mapping.item_type_id = asset.item_type_id;

CREATE UNIQUE INDEX store_asset_code_migration_asset_unique
  ON store_asset_code_migration (asset_id);

CREATE TEMP TABLE store_tooling_code_migration ON COMMIT DROP AS
SELECT tooling.id AS tooling_id, mapping.new_type_code
FROM manufacturing.operation_tooling tooling
JOIN store_item_code_migration mapping
  ON mapping.organization_id = tooling.organization_id
  AND lower(mapping.old_type_code) = lower(tooling.tool_code);

CREATE UNIQUE INDEX store_tooling_code_migration_tooling_unique
  ON store_tooling_code_migration (tooling_id);

-- Move user-facing unique codes through collision-proof temporary values.
UPDATE store.item_types item
SET type_code = '__STORE_ITEM_MIGRATION__' || replace(item.id::text, '-', '')
FROM store_item_code_migration mapping
WHERE mapping.item_type_id = item.id;

UPDATE store.assets asset
SET asset_code = '__STORE_ASSET_MIGRATION__' || replace(asset.id::text, '-', '')
FROM store_asset_code_migration mapping
WHERE mapping.asset_id = asset.id;

UPDATE manufacturing.operation_tooling tooling
SET tool_code = '__STORE_TOOLING_MIGRATION__' || replace(tooling.id::text, '-', ''),
  updated_at = now(),
  row_version = tooling.row_version + 1
FROM store_tooling_code_migration mapping
WHERE mapping.tooling_id = tooling.id;

-- Tooling Master payloads may contain any of the current or legacy field names.
UPDATE manufacturing.operation_tooling tooling
SET source_payload = tooling.source_payload || jsonb_build_object('fixture', mapping.new_type_code),
  updated_at = now(), row_version = tooling.row_version + 1
FROM store_item_code_migration mapping
WHERE mapping.organization_id = tooling.organization_id
  AND tooling.source_payload ? 'fixture'
  AND lower(tooling.source_payload->>'fixture') = lower(mapping.old_type_code);

UPDATE manufacturing.operation_tooling tooling
SET source_payload = tooling.source_payload || jsonb_build_object('tooling', mapping.new_type_code),
  updated_at = now(), row_version = tooling.row_version + 1
FROM store_item_code_migration mapping
WHERE mapping.organization_id = tooling.organization_id
  AND tooling.source_payload ? 'tooling'
  AND lower(tooling.source_payload->>'tooling') = lower(mapping.old_type_code);

UPDATE manufacturing.operation_tooling tooling
SET source_payload = tooling.source_payload || jsonb_build_object('foamTool', mapping.new_type_code),
  updated_at = now(), row_version = tooling.row_version + 1
FROM store_item_code_migration mapping
WHERE mapping.organization_id = tooling.organization_id
  AND tooling.source_payload ? 'foamTool'
  AND lower(tooling.source_payload->>'foamTool') = lower(mapping.old_type_code);

UPDATE manufacturing.operation_tooling tooling
SET source_payload = tooling.source_payload || jsonb_build_object('FIXTURE', mapping.new_type_code),
  updated_at = now(), row_version = tooling.row_version + 1
FROM store_item_code_migration mapping
WHERE mapping.organization_id = tooling.organization_id
  AND tooling.source_payload ? 'FIXTURE'
  AND lower(tooling.source_payload->>'FIXTURE') = lower(mapping.old_type_code);

UPDATE manufacturing.operation_tooling tooling
SET source_payload = tooling.source_payload || jsonb_build_object('TOOLING', mapping.new_type_code),
  updated_at = now(), row_version = tooling.row_version + 1
FROM store_item_code_migration mapping
WHERE mapping.organization_id = tooling.organization_id
  AND tooling.source_payload ? 'TOOLING'
  AND lower(tooling.source_payload->>'TOOLING') = lower(mapping.old_type_code);

UPDATE manufacturing.operation_tooling tooling
SET source_payload = tooling.source_payload || jsonb_build_object('FOAM TOOL', mapping.new_type_code),
  updated_at = now(), row_version = tooling.row_version + 1
FROM store_item_code_migration mapping
WHERE mapping.organization_id = tooling.organization_id
  AND tooling.source_payload ? 'FOAM TOOL'
  AND lower(tooling.source_payload->>'FOAM TOOL') = lower(mapping.old_type_code);

UPDATE store.item_types item
SET type_code = mapping.new_type_code,
  updated_at = now()
FROM store_item_code_migration mapping
WHERE mapping.item_type_id = item.id;

UPDATE store.assets asset
SET asset_code = mapping.new_asset_code,
  updated_at = now()
FROM store_asset_code_migration mapping
WHERE mapping.asset_id = asset.id;

UPDATE store.item_types item
SET next_asset_number = greatest(
    item.next_asset_number,
    asset_count.current_value + 1
  ),
  updated_at = now()
FROM (
  SELECT asset.item_type_id, count(*)::integer AS current_value
  FROM store.assets asset
  GROUP BY asset.item_type_id
) asset_count
WHERE asset_count.item_type_id = item.id;

UPDATE manufacturing.operation_tooling tooling
SET tool_code = mapping.new_type_code,
  updated_at = now(),
  row_version = tooling.row_version + 1
FROM store_tooling_code_migration mapping
WHERE mapping.tooling_id = tooling.id;

DELETE FROM store.number_counters
WHERE counter_year = 0
  AND counter_key IN (
    'TYPE_CODE',
    'ITEM_TYPE_CONSUMABLE',
    'ITEM_TYPE_NON_CONSUMABLE'
  );

INSERT INTO store.number_counters (
  organization_id, counter_key, counter_year, current_value
)
SELECT organization_id,
  CASE tracking_mode
    WHEN 'CONSUMABLE' THEN 'ITEM_TYPE_CONSUMABLE'
    ELSE 'ITEM_TYPE_NON_CONSUMABLE'
  END,
  0,
  count(*)::integer
FROM store_item_code_migration
GROUP BY organization_id, tracking_mode;

ANALYZE store.item_types;
ANALYZE store.assets;
ANALYZE manufacturing.operation_tooling;
