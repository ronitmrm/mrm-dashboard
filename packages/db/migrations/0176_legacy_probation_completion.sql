-- Keep the old-system completion assertion separate from letter issuance.
ALTER TABLE recruitment.employee_post_assignments
  ADD COLUMN legacy_probation_completed boolean NOT NULL DEFAULT false;
