CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE core.number_sequences
  ADD COLUMN source_payload jsonb;

ALTER TABLE catalog.item_categories
  ADD COLUMN code text;

ALTER TABLE catalog.item_subcategories
  ADD COLUMN combination_code text;

ALTER TABLE catalog.website_applications
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0);

ALTER TABLE catalog.website_certifications
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0
    CHECK (sort_order >= 0);

ALTER TABLE sales.commercial_terms
  ADD COLUMN term_type text NOT NULL DEFAULT 'General';

ALTER TABLE sales.packaging_options
  ADD COLUMN cost_basis text NOT NULL DEFAULT 'Per 100 pcs';

ALTER TABLE sales.material_rates
  ADD COLUMN rod_type_id uuid REFERENCES catalog.rod_types(id),
  ADD COLUMN alloy_premium numeric(18,6) NOT NULL DEFAULT 0
    CHECK (alloy_premium >= 0),
  ADD COLUMN extrusion_cost numeric(18,6) NOT NULL DEFAULT 0
    CHECK (extrusion_cost >= 0);

ALTER TABLE sales.material_rates
  DROP CONSTRAINT material_rates_organization_id_material_grade_id_effective__key;

CREATE UNIQUE INDEX material_rates_legacy_scope_unique
  ON sales.material_rates (
    organization_id,
    material_grade_id,
    rod_type_id,
    effective_on
  );
