ALTER TABLE recruitment.post_replacements
  ADD COLUMN application_id uuid REFERENCES recruitment.applications(id);

CREATE INDEX post_replacements_application
  ON recruitment.post_replacements (organization_id, application_id)
  WHERE application_id IS NOT NULL;
