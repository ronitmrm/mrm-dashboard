-- Preserve Pricing Drawing History, Website Product Data, and dashboard fields.

ALTER TABLE catalog.drawings
  ADD COLUMN IF NOT EXISTS source_quote_item_id uuid REFERENCES sales.quote_items(id),
  ADD COLUMN IF NOT EXISTS buffoli_laminated_quantity integer NOT NULL DEFAULT 0
    CHECK (buffoli_laminated_quantity >= 0),
  ADD COLUMN IF NOT EXISTS conventional_laminated_quantity integer NOT NULL DEFAULT 0
    CHECK (conventional_laminated_quantity >= 0),
  ADD COLUMN IF NOT EXISTS cnc_laminated_quantity integer NOT NULL DEFAULT 0
    CHECK (cnc_laminated_quantity >= 0),
  ADD COLUMN IF NOT EXISTS remarks text;

UPDATE catalog.drawings
SET source_quote_item_id = CASE
      WHEN source_payload ->> 'quoteItemId' ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (source_payload ->> 'quoteItemId')::uuid
      ELSE source_quote_item_id
    END,
    remarks = COALESCE(remarks, source_payload ->> 'remarks')
WHERE source_payload IS NOT NULL;

ALTER TABLE catalog.website_product_profiles
  ADD COLUMN IF NOT EXISTS source_quote_item_id uuid REFERENCES sales.quote_items(id),
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS product_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS part_code text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS material text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS material_construction text,
  ADD COLUMN IF NOT EXISTS finish_plating text,
  ADD COLUMN IF NOT EXISTS thread_standard text,
  ADD COLUMN IF NOT EXISTS sealant text,
  ADD COLUMN IF NOT EXISTS temperature text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pressure text,
  ADD COLUMN IF NOT EXISTS connections text,
  ADD COLUMN IF NOT EXISTS final_assemblies_code text,
  ADD COLUMN IF NOT EXISTS catalog_grade text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS applications text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS certifications text,
  ADD COLUMN IF NOT EXISTS additional_notes text,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS website_category text,
  ADD COLUMN IF NOT EXISTS website_sub_category text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_created_at date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS drawing_category text,
  ADD COLUMN IF NOT EXISTS thread_size_1 text,
  ADD COLUMN IF NOT EXISTS thread_size_2 text,
  ADD COLUMN IF NOT EXISTS thread_size_3 text,
  ADD COLUMN IF NOT EXISTS thread_size_4 text,
  ADD COLUMN IF NOT EXISTS assembly_uid_1 text,
  ADD COLUMN IF NOT EXISTS assembly_code_1 text,
  ADD COLUMN IF NOT EXISTS assembly_uid_2 text,
  ADD COLUMN IF NOT EXISTS assembly_code_2 text,
  ADD COLUMN IF NOT EXISTS assembly_uid_3 text,
  ADD COLUMN IF NOT EXISTS assembly_code_3 text,
  ADD COLUMN IF NOT EXISTS assembly_uid_4 text,
  ADD COLUMN IF NOT EXISTS assembly_code_4 text,
  ADD COLUMN IF NOT EXISTS assembly_uid_5 text,
  ADD COLUMN IF NOT EXISTS assembly_code_5 text,
  ADD COLUMN IF NOT EXISTS assembly_uid_6 text,
  ADD COLUMN IF NOT EXISTS assembly_code_6 text,
  ADD COLUMN IF NOT EXISTS website_status text NOT NULL DEFAULT 'In Progress'
    CHECK (website_status IN ('In Progress', 'Completed'));

UPDATE catalog.website_product_profiles profiles
SET source_quote_item_id = CASE
      WHEN profiles.source_payload ->> 'quoteItemId' ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (profiles.source_payload ->> 'quoteItemId')::uuid
      ELSE profiles.source_quote_item_id
    END,
    product_description = CASE
      WHEN btrim(profiles.product_description) = '' THEN profiles.title
      ELSE profiles.product_description
    END,
    material_construction = COALESCE(
      profiles.material_construction,
      items.production_type
    ),
    is_active = COALESCE(
      (profiles.source_payload ->> 'isActive')::boolean,
      profiles.is_active
    ),
    published = COALESCE(
      (profiles.source_payload ->> 'isActive')::boolean,
      profiles.published
    ),
    website_status = CASE
      WHEN profiles.source_payload ->> 'websiteStatus' = 'Completed'
      THEN 'Completed'
      ELSE profiles.website_status
    END
FROM catalog.items items
WHERE items.id = profiles.item_id;

CREATE UNIQUE INDEX IF NOT EXISTS website_product_profiles_part_code_unique
  ON catalog.website_product_profiles (organization_id, lower(part_code))
  WHERE part_code IS NOT NULL AND btrim(part_code) <> '';

CREATE INDEX IF NOT EXISTS website_product_profiles_status_idx
  ON catalog.website_product_profiles (organization_id, website_status, is_active);
