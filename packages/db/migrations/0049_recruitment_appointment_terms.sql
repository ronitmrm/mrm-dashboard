-- Persist final candidate appointment terms and the approved-post joining date.

ALTER TABLE recruitment.applications
  ADD COLUMN IF NOT EXISTS willing_to_join boolean,
  ADD COLUMN IF NOT EXISTS salary_before_probation numeric(14, 2),
  ADD COLUMN IF NOT EXISTS salary_after_probation_minimum numeric(14, 2),
  ADD COLUMN IF NOT EXISTS salary_after_probation_maximum numeric(14, 2);

ALTER TABLE recruitment.applications
  DROP CONSTRAINT IF EXISTS recruitment_applications_appointment_terms_check;

ALTER TABLE recruitment.applications
  ADD CONSTRAINT recruitment_applications_appointment_terms_check
  CHECK (
    willing_to_join IS DISTINCT FROM true
    OR (
      joining_date IS NOT NULL
      AND salary_before_probation > 0
      AND salary_after_probation_minimum > 0
      AND salary_after_probation_maximum >= salary_after_probation_minimum
    )
  );

ALTER TABLE recruitment.posts
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS appointed_application_id uuid
    REFERENCES recruitment.applications(id) ON DELETE SET NULL;

ALTER TABLE recruitment.posts
  DROP CONSTRAINT IF EXISTS recruitment_posts_joining_date_check;

ALTER TABLE recruitment.posts
  ADD CONSTRAINT recruitment_posts_joining_date_check
  CHECK (
    joining_date IS NULL
    OR status IN ('Appointed', 'Occupied')
  );

CREATE INDEX IF NOT EXISTS recruitment_posts_appointment_due_idx
  ON recruitment.posts (organization_id, joining_date)
  WHERE status = 'Appointed' AND joining_date IS NOT NULL;
