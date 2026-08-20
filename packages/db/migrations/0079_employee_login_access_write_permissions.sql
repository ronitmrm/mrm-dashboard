-- Employee account provisioning links the new Better Auth identity to Employee
-- Master. Post access profiles also upsert and remove role assignments.

GRANT INSERT
  ON identity.employee_links
  TO mrmpl_web;

GRANT INSERT, UPDATE, DELETE
  ON identity.post_role_assignments
  TO mrmpl_web;
