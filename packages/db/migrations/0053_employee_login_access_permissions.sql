-- The managed migration login owns these tables, so the identity schema's
-- original default privileges do not grant the application role access.

GRANT SELECT
  ON identity.employee_links, identity.post_role_assignments
  TO mrmpl_web;
