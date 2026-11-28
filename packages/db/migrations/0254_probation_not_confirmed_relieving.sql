-- HR can relieve an employee whose probation is not confirmed and issue a
-- Relieving Letter. Both tables are owned by the migration role in production.
ALTER TABLE recruitment.employee_post_assignments
  DROP CONSTRAINT employee_post_assignments_exit_type_check,
  ADD CONSTRAINT employee_post_assignments_exit_type_check
    CHECK (exit_type IN ('Resigned', 'Left Without Process', 'Unspecified',
      'Role Changed', 'Probation Not Confirmed'));

ALTER TABLE recruitment.employment_letters
  DROP CONSTRAINT employment_letters_letter_type_check,
  ADD CONSTRAINT employment_letters_letter_type_check
    CHECK (letter_type IN ('offer', 'appointment', 'experience', 'relieving'));
