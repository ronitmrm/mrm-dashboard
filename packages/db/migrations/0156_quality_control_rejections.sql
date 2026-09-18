BEGIN;
CREATE TABLE quality.rejection_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  production_floor_code text NOT NULL CHECK (production_floor_code IN ('conventional','conventional-02','cnc','forging')),
  rejection_date date NOT NULL,
  stage text NOT NULL CHECK (stage IN ('Checking','Assembly','Quality Control')),
  type_name text NOT NULL CHECK (length(btrim(type_name)) > 0),
  defect_name text NOT NULL CHECK (length(btrim(defect_name)) > 0),
  reason_name text NOT NULL CHECK (length(btrim(reason_name)) > 0),
  pieces integer NOT NULL CHECK (pieces > 0),
  kg numeric(18,3) NOT NULL CHECK (kg > 0),
  entered_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL,
  UNIQUE (organization_id, request_id)
);
CREATE INDEX rejection_entries_register ON quality.rejection_entries(organization_id, rejection_date, production_floor_code);
CREATE INDEX rejection_entries_job_card ON quality.rejection_entries(work_order_id);
GRANT SELECT, INSERT ON quality.rejection_entries TO mrmpl_web;
GRANT SELECT ON quality.rejection_entries TO mrmpl_reporting;
INSERT INTO identity.permissions(key,module,name,description) VALUES
 ('quality.control.read','quality','Quality Control read','Find Job Cards across all units for additional rejection entry.'),
 ('quality.control.write','quality','Quality Control write','Record Checking, Assembly and Quality Control rejection.'),
 ('quality.rejection_register.read','quality','Rejection Register read','Read consolidated rejection events across all units.');
INSERT INTO identity.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM identity.roles r CROSS JOIN identity.permissions p
WHERE r.key='administrator' AND p.key IN ('quality.control.read','quality.control.write','quality.rejection_register.read') ON CONFLICT DO NOTHING;
COMMIT;
