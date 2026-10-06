CREATE TABLE store.make_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX store_make_models_name_unique
  ON store.make_models (organization_id, lower(name));

INSERT INTO store.make_models (organization_id, name)
SELECT DISTINCT ON (organization_id, lower(name)) organization_id, name
FROM (
  SELECT organization_id,
    coalesce(nullif(btrim(model_number), ''),
      nullif(btrim(manufacturer_make), ''), 'Unspecified') AS name
  FROM store.item_types
) source
ORDER BY organization_id, lower(name), name;

ALTER TABLE store.item_types
  ADD COLUMN make_model_id uuid REFERENCES store.make_models(id);

UPDATE store.item_types item
SET make_model_id = make_model.id
FROM store.make_models make_model
WHERE make_model.organization_id = item.organization_id
  AND lower(make_model.name) = lower(
    coalesce(nullif(btrim(item.model_number), ''),
      nullif(btrim(item.manufacturer_make), ''), 'Unspecified')
  );

ALTER TABLE store.item_types
  ALTER COLUMN make_model_id SET NOT NULL;

DROP INDEX store.store_item_types_combination_unique;

CREATE UNIQUE INDEX store_item_types_combination_unique
  ON store.item_types (
    organization_id, tracking_mode, asset_category_id,
    asset_subcategory_id, asset_name_id, make_model_id
  );

GRANT SELECT, INSERT, UPDATE ON store.make_models TO mrmpl_web;
GRANT SELECT ON store.make_models TO mrmpl_worker, mrmpl_reporting;

INSERT INTO identity.permissions (key, module, name, description)
VALUES
  ('masters.universal.MAKE_MODEL.read', 'masters', 'Universal / Make/Model / read', 'Read Store Make/Model master.'),
  ('masters.universal.MAKE_MODEL.save', 'masters', 'Universal / Make/Model / save', 'Save Store Make/Model master.'),
  ('masters.universal.MAKE_MODEL.import', 'masters', 'Universal / Make/Model / import', 'Import Store Make/Model master.'),
  ('masters.universal.MAKE_MODEL.delete', 'masters', 'Universal / Make/Model / delete', 'Delete Store Make/Model master.');

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT old_grant.role_id, new_permission.id
FROM identity.role_permissions old_grant
JOIN identity.permissions old_permission ON old_permission.id = old_grant.permission_id
JOIN identity.permissions new_permission
  ON new_permission.key = replace(old_permission.key,
    'masters.universal.ASSET_NAME.', 'masters.universal.MAKE_MODEL.')
WHERE old_permission.key LIKE 'masters.universal.ASSET_NAME.%'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION core.delete_master_record(
  p_schema text, p_table text, p_organization_id uuid, p_record_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $$
DECLARE
  deleted_count integer;
  target_key text := p_schema || '.' || p_table;
BEGIN
  IF target_key <> ALL (ARRAY[
    'catalog.website_applications',
    'catalog.item_categories',
    'catalog.website_certifications',
    'catalog.machine_types',
    'catalog.material_grades',
    'catalog.design_processes',
    'catalog.rod_types',
    'catalog.rod_sizes',
    'catalog.item_subcategories',
    'catalog.website_field_options',
    'sales.commercial_terms',
    'sales.material_rates',
    'sales.packaging_options',
    'sales.quote_term_templates',
    'sales.shipping_terms',
    'manufacturing.operation_cycle_standards',
    'recruitment.departments',
    'recruitment.designations',
    'recruitment.requirement_templates',
    'catalog.machines',
    'maintenance.checklist_items',
    'maintenance.definitions',
    'manufacturing.planning_calendar_exceptions',
    'quality.parameter_names',
    'quality.measuring_instruments',
    'quality.parameter_definitions',
    'quality.rejection_reasons',
    'quality.rejection_remarks',
    'quality.rejection_types',
    'manufacturing.operation_setups',
    'manufacturing.setup_names',
    'quality.setup_checklist_template_items',
    'store.asset_names',
    'store.make_models',
    'store.asset_categories',
    'store.item_types',
    'store.locations',
    'store.asset_subcategories',
    'store.suppliers',
    'store.supplier_prices',
    'store.vendors',
    'manufacturing.operation_tooling'
  ]) THEN
    RAISE EXCEPTION 'Master table is not approved for deletion.';
  END IF;
  EXECUTE format('DELETE FROM %I.%I WHERE id = $1 AND organization_id = $2', p_schema, p_table)
    USING p_record_id, p_organization_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count = 1;
END;
$$;
REVOKE ALL ON FUNCTION core.delete_master_record(text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.delete_master_record(text, text, uuid, uuid) TO mrmpl_web;
