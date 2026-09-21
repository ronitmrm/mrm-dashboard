BEGIN;

ALTER TABLE store.code_requests
  ALTER COLUMN requested_category_id DROP NOT NULL,
  ALTER COLUMN requested_subcategory_id DROP NOT NULL,
  ALTER COLUMN requested_asset_name_id DROP NOT NULL;

COMMIT;
