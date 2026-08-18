BEGIN;

CREATE OR REPLACE FUNCTION core.delete_master_record(
  p_schema text,
  p_table text,
  p_organization_id uuid,
  p_record_id uuid
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

  EXECUTE format(
    'DELETE FROM %I.%I WHERE id = $1 AND organization_id = $2',
    p_schema,
    p_table
  )
  USING p_record_id, p_organization_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION core.delete_master_record(text, text, uuid, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.delete_master_record(text, text, uuid, uuid)
TO mrmpl_web;

COMMIT;
