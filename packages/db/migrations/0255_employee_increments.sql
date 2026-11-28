-- Salary increments HR confirms with individual employees. They follow the
-- Employee ID, like personal details, so they survive role or department changes.
CREATE TABLE recruitment.employee_increments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  employee_code text NOT NULL,
  effective_on date NOT NULL,
  increment_percent numeric(6, 2) NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_increments_code_nonempty CHECK (btrim(employee_code) <> ''),
  CONSTRAINT employee_increments_percent_range CHECK (increment_percent >= 0 AND increment_percent <= 500),
  CONSTRAINT employee_increments_note_length CHECK (char_length(note) <= 1000)
);

CREATE INDEX employee_increments_employee
  ON recruitment.employee_increments (organization_id, employee_code, effective_on DESC);

GRANT SELECT, INSERT, DELETE ON recruitment.employee_increments TO mrmpl_web;
