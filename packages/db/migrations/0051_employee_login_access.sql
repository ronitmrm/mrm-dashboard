-- Link Better Auth identities to the canonical HR employee register and
-- derive application roles from approved posts.

CREATE TABLE identity.employee_links (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  employee_code text NOT NULL,
  linked_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (nullif(btrim(employee_code), '') IS NOT NULL)
);

CREATE UNIQUE INDEX employee_links_employee_unique
  ON identity.employee_links (organization_id, lower(employee_code));

CREATE TABLE identity.post_role_assignments (
  post_id uuid NOT NULL REFERENCES recruitment.posts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, role_id)
);

CREATE INDEX post_role_assignments_role_idx
  ON identity.post_role_assignments (role_id);
