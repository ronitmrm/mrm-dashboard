BEGIN;
ALTER TABLE quality.rejection_entries
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id);
GRANT UPDATE (
  work_order_id, production_floor_code, rejection_date, stage,
  type_name, defect_name, reason_name, pieces, kg,
  updated_at, updated_by_user_id
) ON quality.rejection_entries TO mrmpl_web;
COMMIT;
