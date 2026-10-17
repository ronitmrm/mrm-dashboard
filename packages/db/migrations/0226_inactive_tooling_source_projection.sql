-- Retain superseded tooling history without publishing inactive requirements.
BEGIN;

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

  IF TG_TABLE_SCHEMA = 'manufacturing' AND TG_TABLE_NAME = 'operation_tooling'
    AND new_row->>'active' = 'false' THEN
    is_active := false;
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

DELETE FROM derived.dashboard_source_records source
USING manufacturing.operation_tooling tool
WHERE source.organization_id = tool.organization_id
  AND source.source_schema = 'manufacturing'
  AND source.source_table = 'operation_tooling'
  AND source.source_id = tool.source_id
  AND NOT tool.active;

COMMIT;