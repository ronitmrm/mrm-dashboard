-- Identification is optional for Item Types and the physical units received
-- from them. Keep non-null strings so existing readers retain their contract.
ALTER TABLE store.item_types
  DROP CONSTRAINT item_types_identification_name_check;
ALTER TABLE store.assets
  DROP CONSTRAINT assets_identification_name_check;
