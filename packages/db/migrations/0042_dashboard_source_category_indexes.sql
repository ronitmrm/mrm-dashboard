-- Per-category indexes prevent a high-volume source such as hourly checks from
-- starving smaller master or workflow categories inside a bounded rebuild.

CREATE INDEX IF NOT EXISTS dashboard_source_records_entry_type_read_idx
  ON derived.dashboard_source_records (
    organization_id, source_kind, entry_type, changed_at DESC, source_id DESC
  )
  INCLUDE (source_group);

CREATE INDEX IF NOT EXISTS dashboard_source_records_physical_group_read_idx
  ON derived.dashboard_source_records (
    organization_id, source_kind, source_group, changed_at DESC, source_id DESC
  )
  INCLUDE (entry_type);
