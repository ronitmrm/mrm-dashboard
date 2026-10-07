ALTER TABLE store.assets
  ADD COLUMN manufacturer_make text;

UPDATE store.assets asset
SET manufacturer_make = NULLIF(btrim(item.manufacturer_make), '')
FROM store.item_types item
WHERE item.id = asset.item_type_id
  AND item.organization_id = asset.organization_id
  AND NULLIF(btrim(item.manufacturer_make), '') IS NOT NULL;
