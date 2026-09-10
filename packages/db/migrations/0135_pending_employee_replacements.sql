CREATE TABLE recruitment.post_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  post_id uuid NOT NULL REFERENCES recruitment.posts(id),
  employee_name text NOT NULL CHECK (btrim(employee_name) <> ''),
  employee_code text CHECK (employee_code ~ '^[0-9]+$'),
  outgoing_assignment jsonb NOT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Joined', 'Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX post_replacements_one_pending
  ON recruitment.post_replacements (post_id) WHERE status = 'Pending';
CREATE INDEX post_replacements_history
  ON recruitment.post_replacements (organization_id, post_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON recruitment.post_replacements TO mrmpl_web;
GRANT SELECT ON recruitment.post_replacements TO mrmpl_worker, mrmpl_reporting;

-- Protect reservations from other assignment/import/combined-role write paths.
CREATE FUNCTION recruitment.protect_pending_replacement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM recruitment.post_replacements
             WHERE post_id = OLD.id AND status = 'Pending')
     AND (NEW.employee_name IS DISTINCT FROM OLD.employee_name
       OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
       OR NEW.status <> 'Resigned'
       OR NEW.combined_role_id IS DISTINCT FROM OLD.combined_role_id) THEN
    RAISE EXCEPTION 'Confirm or cancel the pending replacement before changing this assignment or combined job.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_pending_replacement
  BEFORE UPDATE ON recruitment.posts
  FOR EACH ROW EXECUTE FUNCTION recruitment.protect_pending_replacement();
