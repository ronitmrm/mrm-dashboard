-- Universal vocabulary; inspection definitions remain scoped to their existing unit/setup.

CREATE TABLE quality.parameter_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);
CREATE UNIQUE INDEX parameter_names_name_unique ON quality.parameter_names (organization_id, lower(btrim(name)));
CREATE TRIGGER sync_dashboard_source_parameter_names
AFTER INSERT OR UPDATE OR DELETE ON quality.parameter_names
FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record(
  'data_entry', 'dataEntries', 'parameter_master', 'updated_at', 'created_at', 'data_entries_or_mrm');
GRANT SELECT, INSERT, UPDATE ON quality.parameter_names TO mrmpl_web;
GRANT SELECT ON quality.parameter_names TO mrmpl_worker;

INSERT INTO quality.parameter_names (organization_id, name, source_system, source_table, source_id, source_payload)
SELECT organization_id, min(name), 'mrm-dashboard', 'parameter_master', gen_random_uuid()::text,
  jsonb_build_object('name', min(name), 'status', 'Active')
FROM (
  SELECT organization_id, btrim(name) AS name
  FROM quality.parameter_definitions
) existing
WHERE name <> ''
GROUP BY organization_id, lower(name);

CREATE TABLE quality.measuring_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);
CREATE UNIQUE INDEX measuring_instruments_name_unique ON quality.measuring_instruments (organization_id, lower(btrim(name)));
CREATE TRIGGER sync_dashboard_source_measuring_instruments
AFTER INSERT OR UPDATE OR DELETE ON quality.measuring_instruments
FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record(
  'data_entry', 'dataEntries', 'measuring_instrument_master', 'updated_at', 'created_at', 'data_entries_or_mrm');
GRANT SELECT, INSERT, UPDATE ON quality.measuring_instruments TO mrmpl_web;
GRANT SELECT ON quality.measuring_instruments TO mrmpl_worker;

INSERT INTO quality.measuring_instruments (organization_id, name, source_system, source_table, source_id, source_payload)
SELECT organization_id, min(name), 'mrm-dashboard', 'measuring_instrument_master', gen_random_uuid()::text,
  jsonb_build_object('name', min(name), 'status', 'Active')
FROM (
  SELECT organization_id, btrim(COALESCE(source_payload->'payload'->>'instrumentUsed', source_payload->>'instrumentUsed', '')) AS name
  FROM quality.parameter_definitions
) existing
WHERE name <> ''
GROUP BY organization_id, lower(name);

ALTER TABLE quality.parameter_definitions
  ADD COLUMN parameter_name_id uuid REFERENCES quality.parameter_names(id),
  ADD COLUMN measuring_instrument_id uuid REFERENCES quality.measuring_instruments(id);
UPDATE quality.parameter_definitions definition SET parameter_name_id = choice.id
FROM quality.parameter_names choice
WHERE choice.organization_id = definition.organization_id
  AND lower(btrim(choice.name)) = lower(btrim(definition.name));
UPDATE quality.parameter_definitions definition SET measuring_instrument_id = choice.id
FROM quality.measuring_instruments choice
WHERE choice.organization_id = definition.organization_id
  AND lower(btrim(choice.name)) = lower(btrim(COALESCE(
    definition.source_payload->'payload'->>'instrumentUsed', definition.source_payload->>'instrumentUsed', '')));
CREATE INDEX parameter_definitions_parameter_name_idx ON quality.parameter_definitions(parameter_name_id);
CREATE INDEX parameter_definitions_measuring_instrument_idx ON quality.parameter_definitions(measuring_instrument_id);

-- Start with the existing Universal quality-master access, preserving user overrides.
CREATE TEMP TABLE quality_reference_permission_mapping ON COMMIT DROP AS
SELECT p.id AS old_id,
  replace(p.key, 'rejection_type_master', target.entry) AS new_key,
  replace(p.name, 'Rejection Type', target.label) AS name, p.description
FROM identity.permissions p
CROSS JOIN (VALUES ('parameter_master', 'Parameter'), ('measuring_instrument_master', 'Measuring Instrument')) target(entry, label)
WHERE p.key LIKE 'masters.universal.rejection_type_master.%';
INSERT INTO identity.permissions (key, module, name, description)
SELECT new_key, 'masters', name, description FROM quality_reference_permission_mapping
ON CONFLICT (key) DO NOTHING;
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id FROM quality_reference_permission_mapping map
JOIN identity.role_permissions rp ON rp.permission_id = map.old_id
JOIN identity.permissions p ON p.key = map.new_key ON CONFLICT DO NOTHING;
INSERT INTO identity.user_permission_overrides
  (user_id, permission_id, effect, reason, assigned_by_user_id, assigned_at, expires_at)
SELECT overrides.user_id, p.id, overrides.effect, overrides.reason,
  overrides.assigned_by_user_id, overrides.assigned_at, overrides.expires_at
FROM quality_reference_permission_mapping map
JOIN identity.user_permission_overrides overrides ON overrides.permission_id = map.old_id
JOIN identity.permissions p ON p.key = map.new_key ON CONFLICT DO NOTHING;

-- Extend the existing deletion allowlist; foreign keys protect referenced choices.
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
    'quality.setup_checklist_template_items',
    'store.asset_names',
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
