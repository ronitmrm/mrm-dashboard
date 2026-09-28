BEGIN;
ALTER TABLE quality.rejection_entries
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id);
GRANT UPDATE ON quality.rejection_entries TO mrmpl_web;
COMMIT;
