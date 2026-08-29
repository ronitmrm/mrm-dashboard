BEGIN;

INSERT INTO catalog.design_processes (
  organization_id,
  name,
  sequence,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  organization.id,
  product_type.name,
  product_type.sequence,
  'mrm-dashboard',
  'design_product_type_master',
  'design-product-type:' || organization.id::text || ':' || lower(product_type.name),
  jsonb_build_object('canonical', true)
FROM core.organizations organization
CROSS JOIN (
  VALUES
    ('Barstock', 10),
    ('Forged', 20),
    ('Moulded', 30),
    ('Punching', 40)
) AS product_type(name, sequence)
ON CONFLICT (organization_id, lower(name)) DO UPDATE SET
  name = EXCLUDED.name,
  sequence = EXCLUDED.sequence,
  updated_at = now(),
  row_version = catalog.design_processes.row_version + 1;

UPDATE sales.design_tasks task
SET design_process_id = NULL,
  updated_at = now(),
  row_version = task.row_version + 1
FROM catalog.design_processes process
WHERE task.design_process_id = process.id
  AND lower(btrim(process.name)) IN ('forging', 'conventional', 'cnc');

DELETE FROM catalog.design_processes
WHERE lower(btrim(name)) IN ('forging', 'conventional', 'cnc');

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
  'DP',
  'mrm-dashboard',
  'design_production_type_master',
  'design-production-type:' || organization.id::text || ':dp',
  jsonb_build_object('canonical', true)
FROM core.organizations organization
ON CONFLICT (organization_id, lower(name)) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now(),
  row_version = catalog.machine_types.row_version + 1;

COMMIT;
