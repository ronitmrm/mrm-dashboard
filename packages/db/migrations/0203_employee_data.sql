-- Personal details follow an Employee ID; employment conditions follow each joined post assignment.
-- The existing Employee Master join event creates the assignment row before either record is filled.
CREATE TABLE recruitment.employee_profiles (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  employee_code text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, employee_code),
  CONSTRAINT employee_profiles_code_nonempty CHECK (btrim(employee_code) <> ''),
  CONSTRAINT employee_profiles_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE TABLE recruitment.employee_term_details (
  assignment_id uuid PRIMARY KEY REFERENCES recruitment.employee_post_assignments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_term_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX employee_term_details_organization
  ON recruitment.employee_term_details (organization_id);

GRANT SELECT, INSERT, UPDATE ON recruitment.employee_profiles TO mrmpl_web;
GRANT SELECT, INSERT, UPDATE ON recruitment.employee_term_details TO mrmpl_web;
