BEGIN;

INSERT INTO catalog.machine_types (
  organization_id,
  name,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  organization.id,
  production_type.name,
  'mrm-dashboard',
  'design_production_type_master',
  'design-production-type:' || organization.id::text || ':' || lower(replace(production_type.name, '/', '-')),
  jsonb_build_object('canonical', true)
FROM core.organizations organization
CROSS JOIN (
  VALUES
    ('M/C Assembly'),
    ('Assembly')
) AS production_type(name)
ON CONFLICT (organization_id, lower(name)) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now(),
  row_version = catalog.machine_types.row_version + 1;

COMMIT;
