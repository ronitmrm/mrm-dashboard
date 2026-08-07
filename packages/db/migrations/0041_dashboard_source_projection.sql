-- Maintain a single indexed source projection for bounded dashboard rebuilds.
-- Canonical domain tables remain the source of truth; this table is a durable,
-- transactionally maintained read projection that can always be rebuilt.

CREATE TABLE IF NOT EXISTS derived.dashboard_source_records (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  source_schema text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_kind text NOT NULL
    CHECK (source_kind IN ('data_entry', 'physical', 'correction')),
  source_group text NOT NULL,
  entry_type text,
  changed_at timestamptz NOT NULL,
  source_payload jsonb NOT NULL,
  PRIMARY KEY (organization_id, source_schema, source_table, source_id)
) WITH (fillfactor = 90);

CREATE INDEX IF NOT EXISTS dashboard_source_records_bounded_read_idx
  ON derived.dashboard_source_records (
    organization_id, source_kind, changed_at DESC, source_id DESC
  )
  INCLUDE (source_group, entry_type);

CREATE INDEX IF NOT EXISTS dashboard_source_records_group_read_idx
  ON derived.dashboard_source_records (
    organization_id, source_group, changed_at DESC, source_id DESC
  );

CREATE OR REPLACE FUNCTION derived.sync_dashboard_source_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  record_organization_id uuid;
  record_source_id text;
  record_payload jsonb;
  record_changed_at timestamptz;
  identity_mode text := COALESCE(TG_ARGV[5], 'any');
  is_active boolean;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_row := to_jsonb(OLD);
    DELETE FROM derived.dashboard_source_records
    WHERE organization_id = (old_row->>'organization_id')::uuid
      AND source_schema = TG_TABLE_SCHEMA
      AND source_table = TG_TABLE_NAME
      AND source_id = old_row->>'source_id';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  new_row := to_jsonb(NEW);
  record_organization_id := (new_row->>'organization_id')::uuid;
  record_source_id := new_row->>'source_id';
  record_payload := new_row->'source_payload';
  is_active := record_payload IS NOT NULL AND record_payload <> 'null'::jsonb;

  IF identity_mode = 'data_entries' THEN
    is_active := is_active AND new_row->>'source_table' = 'dataEntries';
  ELSIF identity_mode = 'data_entries_or_mrm' THEN
    is_active := is_active AND (
      new_row->>'source_table' = 'dataEntries'
      OR new_row->>'source_system' = 'mrm-dashboard'
    );
  END IF;

  IF new_row ? 'reversed_at' AND new_row->'reversed_at' <> 'null'::jsonb THEN
    is_active := false;
  END IF;

  IF NOT is_active OR record_source_id IS NULL OR record_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    record_changed_at := COALESCE(
      NULLIF(new_row->>TG_ARGV[3], '')::timestamptz,
      NULLIF(new_row->>TG_ARGV[4], '')::timestamptz,
      NULLIF(new_row->>'updated_at', '')::timestamptz,
      NULLIF(new_row->>'created_at', '')::timestamptz,
      clock_timestamp()
    );
  EXCEPTION WHEN invalid_datetime_format THEN
    record_changed_at := clock_timestamp();
  END;

  INSERT INTO derived.dashboard_source_records (
    organization_id, source_schema, source_table, source_id, source_kind,
    source_group, entry_type, changed_at, source_payload
  ) VALUES (
    record_organization_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, record_source_id,
    TG_ARGV[0], TG_ARGV[1], NULLIF(TG_ARGV[2], ''), record_changed_at,
    record_payload
  )
  ON CONFLICT (organization_id, source_schema, source_table, source_id)
  DO UPDATE SET
    source_kind = EXCLUDED.source_kind,
    source_group = EXCLUDED.source_group,
    entry_type = EXCLUDED.entry_type,
    changed_at = EXCLUDED.changed_at,
    source_payload = EXCLUDED.source_payload;

  RETURN NEW;
END;
$$;

-- Backfill the current canonical rows before enabling ongoing synchronization.
INSERT INTO derived.dashboard_source_records (
  organization_id, source_schema, source_table, source_id, source_kind,
  source_group, entry_type, changed_at, source_payload
)
SELECT organization_id, source_schema, source_table, source_id, 'data_entry',
  'dataEntries', entry_type, changed_at, source_payload
FROM (
  SELECT organization_id, 'catalog'::text AS source_schema,
    'machines'::text AS source_table, source_id, 'machine_master'::text AS entry_type,
    updated_at AS changed_at, source_payload
  FROM catalog.machines
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'manufacturing', 'operation_setups', source_id,
    'route', updated_at, source_payload FROM manufacturing.operation_setups
  WHERE source_payload IS NOT NULL AND source_table = 'dataEntries'
  UNION ALL SELECT organization_id, 'manufacturing', 'operation_cycle_standards',
    source_id, 'cycle', updated_at, source_payload
  FROM manufacturing.operation_cycle_standards WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'manufacturing', 'operation_tooling', source_id,
    'tooling', updated_at, source_payload FROM manufacturing.operation_tooling
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'manufacturing', 'work_orders', source_id,
    'work_order', updated_at, source_payload FROM manufacturing.work_orders
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'manufacturing', 'raw_material_receipts',
    source_id, 'rm_inward', updated_at, source_payload
  FROM manufacturing.raw_material_receipts WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'workforce', 'employees', source_id, 'employee',
    updated_at, source_payload FROM workforce.employees WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'manufacturing', 'planning_calendar_exceptions',
    source_id, 'planning_holiday', updated_at, source_payload
  FROM manufacturing.planning_calendar_exceptions WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'parameter_definitions', source_id,
    'quality_parameter_master', updated_at, source_payload
  FROM quality.parameter_definitions WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'rejection_types', source_id,
    'rejection_type_master', updated_at, source_payload FROM quality.rejection_types
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'rejection_reasons', source_id,
    'rejection_reason_master', updated_at, source_payload FROM quality.rejection_reasons
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'rejection_remarks', source_id,
    'rejection_remark_master', updated_at, source_payload FROM quality.rejection_remarks
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'first_piece_inspections', source_id,
    'first_piece_inspection_report', inspected_at, source_payload
  FROM quality.first_piece_inspections WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'hourly_checks', source_id,
    'hourly_quality_check', checked_at, source_payload FROM quality.hourly_checks
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'setup_checklist_template_items',
    source_id, 'setup_checklist_master', updated_at, source_payload
  FROM quality.setup_checklist_template_items WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'quality', 'setup_checklist_sessions', source_id,
    'setup_checklist_session', COALESCE(completed_at, started_at), source_payload
  FROM quality.setup_checklist_sessions WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'manufacturing', 'production_cards', source_id,
    'production_card', updated_at, source_payload FROM manufacturing.production_cards
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'maintenance', 'definitions', source_id,
    'maintenance_master', updated_at, source_payload FROM maintenance.definitions
  WHERE source_payload IS NOT NULL AND source_table = 'dataEntries'
  UNION ALL SELECT organization_id, 'maintenance', 'checklist_items', source_id,
    'maintenance_checklist_master', updated_at, source_payload
  FROM maintenance.checklist_items WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'maintenance', 'machine_schedules', source_id,
    'maintenance_schedule', updated_at, source_payload FROM maintenance.machine_schedules
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'maintenance', 'tasks', source_id,
    'maintenance_task', updated_at, source_payload FROM maintenance.tasks
  WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
  UNION ALL SELECT organization_id, 'manufacturing', 'shop_floor_stage_events',
    source_id, 'shop_floor_status', occurred_at, source_payload
  FROM manufacturing.shop_floor_stage_events WHERE source_payload IS NOT NULL
    AND (source_table = 'dataEntries' OR source_system = 'mrm-dashboard')
) source_rows
ON CONFLICT (organization_id, source_schema, source_table, source_id) DO NOTHING;

INSERT INTO derived.dashboard_source_records (
  organization_id, source_schema, source_table, source_id, source_kind,
  source_group, entry_type, changed_at, source_payload
)
SELECT organization_id, source_schema, source_table, source_id, 'physical',
  source_group, NULL, changed_at, source_payload
FROM (
  SELECT organization_id, 'manufacturing'::text AS source_schema,
    'production_entries'::text AS source_table, source_id,
    'productionEntries'::text AS source_group, recorded_at AS changed_at,
    source_payload FROM manufacturing.production_entries
  WHERE source_payload IS NOT NULL AND reversed_at IS NULL
  UNION ALL SELECT organization_id, 'workforce', 'attendance_records', source_id,
    'attendanceRecords', recorded_at, source_payload FROM workforce.attendance_records
  WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'workforce', 'training_records', source_id,
    'trainingRecords', recorded_at, source_payload FROM workforce.training_records
  WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'manufacturing', 'route_selections', source_id,
    'routeSelections', selected_at, source_payload FROM manufacturing.route_selections
  WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'manufacturing', 'planner_priority_events', source_id,
    'plannerPriorities', occurred_at, source_payload
  FROM manufacturing.planner_priority_events WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'manufacturing', 'machine_constraint_events', source_id,
    'machineConstraints', occurred_at, source_payload
  FROM manufacturing.machine_constraint_events WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'manufacturing', 'plan_override_events', source_id,
    'planOverrides', occurred_at, source_payload
  FROM manufacturing.plan_override_events WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'manufacturing', 'route_change_events', source_id,
    'routeChanges', occurred_at, source_payload
  FROM manufacturing.route_change_events WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'manufacturing', 'dispatch_approval_events', source_id,
    'dispatchApprovals', occurred_at, source_payload
  FROM manufacturing.dispatch_approval_events WHERE source_payload IS NOT NULL
  UNION ALL SELECT organization_id, 'manufacturing', 'setup_completion_events', source_id,
    'setupCompletions', completed_at, source_payload
  FROM manufacturing.setup_completion_events WHERE source_payload IS NOT NULL
) source_rows
ON CONFLICT (organization_id, source_schema, source_table, source_id) DO NOTHING;

INSERT INTO derived.dashboard_source_records (
  organization_id, source_schema, source_table, source_id, source_kind,
  source_group, entry_type, changed_at, source_payload
)
SELECT organization_id, 'audit', 'legacy_convex_corrections', source_id,
  'correction', 'corrections', NULL,
  COALESCE(original_timestamp, imported_at), source_payload
FROM audit.legacy_convex_corrections
WHERE source_payload IS NOT NULL
ON CONFLICT (organization_id, source_schema, source_table, source_id) DO NOTHING;

-- Trigger arguments: kind, group, inferred entry type, primary timestamp,
-- fallback timestamp, and source-identity mode.
CREATE TRIGGER sync_dashboard_source_machines AFTER INSERT OR UPDATE OR DELETE ON catalog.machines FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','machine_master','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_operation_setups AFTER INSERT OR UPDATE OR DELETE ON manufacturing.operation_setups FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','route','updated_at','created_at','data_entries');
CREATE TRIGGER sync_dashboard_source_operation_cycle_standards AFTER INSERT OR UPDATE OR DELETE ON manufacturing.operation_cycle_standards FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','cycle','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_operation_tooling AFTER INSERT OR UPDATE OR DELETE ON manufacturing.operation_tooling FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','tooling','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_work_orders AFTER INSERT OR UPDATE OR DELETE ON manufacturing.work_orders FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','work_order','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_raw_material_receipts AFTER INSERT OR UPDATE OR DELETE ON manufacturing.raw_material_receipts FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','rm_inward','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_employees AFTER INSERT OR UPDATE OR DELETE ON workforce.employees FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','employee','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_planning_calendar AFTER INSERT OR UPDATE OR DELETE ON manufacturing.planning_calendar_exceptions FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','planning_holiday','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_parameters AFTER INSERT OR UPDATE OR DELETE ON quality.parameter_definitions FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','quality_parameter_master','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_rejection_types AFTER INSERT OR UPDATE OR DELETE ON quality.rejection_types FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','rejection_type_master','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_rejection_reasons AFTER INSERT OR UPDATE OR DELETE ON quality.rejection_reasons FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','rejection_reason_master','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_rejection_remarks AFTER INSERT OR UPDATE OR DELETE ON quality.rejection_remarks FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','rejection_remark_master','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_first_piece AFTER INSERT OR UPDATE OR DELETE ON quality.first_piece_inspections FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','first_piece_inspection_report','inspected_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_hourly_checks AFTER INSERT OR UPDATE OR DELETE ON quality.hourly_checks FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','hourly_quality_check','checked_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_setup_templates AFTER INSERT OR UPDATE OR DELETE ON quality.setup_checklist_template_items FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','setup_checklist_master','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_setup_sessions AFTER INSERT OR UPDATE OR DELETE ON quality.setup_checklist_sessions FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','setup_checklist_session','completed_at','started_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_production_cards AFTER INSERT OR UPDATE OR DELETE ON manufacturing.production_cards FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','production_card','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_maintenance_definitions AFTER INSERT OR UPDATE OR DELETE ON maintenance.definitions FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','maintenance_master','updated_at','created_at','data_entries');
CREATE TRIGGER sync_dashboard_source_maintenance_checklists AFTER INSERT OR UPDATE OR DELETE ON maintenance.checklist_items FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','maintenance_checklist_master','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_maintenance_schedules AFTER INSERT OR UPDATE OR DELETE ON maintenance.machine_schedules FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','maintenance_schedule','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_maintenance_tasks AFTER INSERT OR UPDATE OR DELETE ON maintenance.tasks FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','maintenance_task','updated_at','created_at','data_entries_or_mrm');
CREATE TRIGGER sync_dashboard_source_shop_floor_status AFTER INSERT OR UPDATE OR DELETE ON manufacturing.shop_floor_stage_events FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('data_entry','dataEntries','shop_floor_status','occurred_at','created_at','data_entries_or_mrm');

CREATE TRIGGER sync_dashboard_source_production_entries AFTER INSERT OR UPDATE OR DELETE ON manufacturing.production_entries FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','productionEntries','','recorded_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_attendance AFTER INSERT OR UPDATE OR DELETE ON workforce.attendance_records FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','attendanceRecords','','recorded_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_training AFTER INSERT OR UPDATE OR DELETE ON workforce.training_records FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','trainingRecords','','recorded_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_route_selections AFTER INSERT OR UPDATE OR DELETE ON manufacturing.route_selections FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','routeSelections','','selected_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_planner_priorities AFTER INSERT OR UPDATE OR DELETE ON manufacturing.planner_priority_events FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','plannerPriorities','','occurred_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_machine_constraints AFTER INSERT OR UPDATE OR DELETE ON manufacturing.machine_constraint_events FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','machineConstraints','','occurred_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_plan_overrides AFTER INSERT OR UPDATE OR DELETE ON manufacturing.plan_override_events FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','planOverrides','','occurred_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_route_changes AFTER INSERT OR UPDATE OR DELETE ON manufacturing.route_change_events FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','routeChanges','','occurred_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_dispatch_approvals AFTER INSERT OR UPDATE OR DELETE ON manufacturing.dispatch_approval_events FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','dispatchApprovals','','occurred_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_setup_completions AFTER INSERT OR UPDATE OR DELETE ON manufacturing.setup_completion_events FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('physical','setupCompletions','','completed_at','created_at','any');
CREATE TRIGGER sync_dashboard_source_corrections AFTER INSERT OR UPDATE OR DELETE ON audit.legacy_convex_corrections FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record('correction','corrections','','original_timestamp','imported_at','any');

ANALYZE derived.dashboard_source_records;
