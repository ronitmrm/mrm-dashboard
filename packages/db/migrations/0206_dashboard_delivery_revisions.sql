-- Small transactional identities for direct facts. Source/audit history is retained.
CREATE TABLE derived.dashboard_source_revisions (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_floor_code text NOT NULL,
  source_key text NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (organization_id, production_floor_code, source_key)
);

CREATE FUNCTION derived.bump_dashboard_delivery_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  value jsonb;
  organization uuid;
  floor_code text;
  category text;
  machine uuid;
BEGIN
  -- Process both scopes: moves and deletes must invalidate the old scope too.
  FOR value IN SELECT DISTINCT row_value FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  ]) row_value WHERE row_value IS NOT NULL LOOP
    organization := (value->>'organization_id')::uuid;
    category := TG_ARGV[0];
    floor_code := '*';
    IF category = 'projection' THEN
      category := CASE value->>'source_kind'
        WHEN 'data_entry' THEN value->>'entry_type'
        WHEN 'correction' THEN 'corrections'
        ELSE value->>'source_group' END;
      IF category NOT IN ('parameter_master', 'measuring_instrument_master',
        'maintenance_checklist_master', 'maintenance_master',
        'rejection_type_master', 'rejection_reason_master', 'rejection_remark_master') THEN
        floor_code := value->>'production_floor_code';
      END IF;
    ELSIF category = 'production_break_schedule' THEN
      SELECT code INTO floor_code FROM manufacturing.production_floors
        WHERE id = (value->>'production_floor_id')::uuid AND organization_id = organization;
    ELSIF category IN ('setup_state', 'sessions') THEN
      machine := (value->>'machine_id')::uuid;
      IF machine IS NULL AND value ? 'production_session_id' THEN
        SELECT machine_id INTO machine FROM manufacturing.production_sessions
        WHERE id = (value->>'production_session_id')::uuid
          AND organization_id = organization;
      END IF;
      SELECT floor.code INTO floor_code FROM catalog.machines m
        JOIN manufacturing.production_floors floor ON floor.id = m.production_floor_id
        WHERE m.id = machine AND m.organization_id = organization;
    END IF;
    IF organization IS NOT NULL AND floor_code IS NOT NULL AND category IS NOT NULL THEN
      INSERT INTO derived.dashboard_source_revisions
        (organization_id, production_floor_code, source_key)
        VALUES (organization, floor_code, category)
      ON CONFLICT (organization_id, production_floor_code, source_key)
      DO UPDATE SET revision = derived.dashboard_source_revisions.revision + 1;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER dashboard_delivery_projection_revision
  AFTER INSERT OR UPDATE OR DELETE ON derived.dashboard_source_records
  FOR EACH ROW EXECUTE FUNCTION derived.bump_dashboard_delivery_revision('projection');
CREATE TRIGGER dashboard_delivery_setup_revision
  AFTER INSERT OR UPDATE OR DELETE ON manufacturing.shop_floor_setup_state
  FOR EACH ROW EXECUTE FUNCTION derived.bump_dashboard_delivery_revision('setup_state');
CREATE TRIGGER dashboard_delivery_session_revision
  AFTER INSERT OR UPDATE OR DELETE ON manufacturing.production_sessions
  FOR EACH ROW EXECUTE FUNCTION derived.bump_dashboard_delivery_revision('sessions');
CREATE TRIGGER dashboard_delivery_downtime_revision
  AFTER INSERT OR UPDATE OR DELETE ON manufacturing.production_session_downtime_events
  FOR EACH ROW EXECUTE FUNCTION derived.bump_dashboard_delivery_revision('sessions');
CREATE TRIGGER dashboard_delivery_rejection_revision
  AFTER INSERT OR UPDATE OR DELETE ON manufacturing.production_session_rejection_events
  FOR EACH ROW EXECUTE FUNCTION derived.bump_dashboard_delivery_revision('sessions');
CREATE TRIGGER dashboard_delivery_item_type_revision
  AFTER INSERT OR UPDATE OR DELETE ON store.item_types
  FOR EACH ROW EXECUTE FUNCTION derived.bump_dashboard_delivery_revision('tooling_asset_codes');
CREATE TRIGGER dashboard_delivery_break_revision
  AFTER INSERT OR UPDATE OR DELETE ON manufacturing.production_break_schedules
  FOR EACH ROW EXECUTE FUNCTION derived.bump_dashboard_delivery_revision('production_break_schedule');

GRANT SELECT ON derived.dashboard_source_revisions TO mrmpl_web, mrmpl_worker, mrmpl_reporting;
GRANT INSERT, UPDATE ON derived.dashboard_source_revisions TO mrmpl_web, mrmpl_worker;
