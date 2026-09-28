ALTER TABLE recruitment.employee_post_assignments
  DROP CONSTRAINT employee_post_assignments_exit_type_check;

ALTER TABLE recruitment.employee_post_assignments
  ADD CONSTRAINT employee_post_assignments_exit_type_check
  CHECK (exit_type IN ('Resigned', 'Left Without Process', 'Unspecified', 'Role Changed'));
