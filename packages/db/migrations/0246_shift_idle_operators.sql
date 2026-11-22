-- End-of-shift check: operators who came to work but had no machine.
-- A check row means the shop floor finished the task for that shift,
-- even when nobody was idle.
CREATE TABLE workforce.shift_idle_operator_checks (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('A', 'B', 'C')),
  checked_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, production_date, shift)
);

CREATE TABLE workforce.shift_idle_operators (
  organization_id uuid NOT NULL,
  production_date date NOT NULL,
  shift text NOT NULL,
  employee_id uuid NOT NULL REFERENCES workforce.employees(id),
  PRIMARY KEY (organization_id, production_date, shift, employee_id),
  FOREIGN KEY (organization_id, production_date, shift)
    REFERENCES workforce.shift_idle_operator_checks (organization_id, production_date, shift)
    ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE ON workforce.shift_idle_operator_checks TO mrmpl_web;
GRANT SELECT, INSERT, DELETE ON workforce.shift_idle_operators TO mrmpl_web;
GRANT SELECT ON workforce.shift_idle_operator_checks, workforce.shift_idle_operators TO mrmpl_reporting;
