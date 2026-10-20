-- Retain issued appointment PDFs when a user explicitly regenerates a correction.
ALTER TABLE recruitment.employment_letters
  DROP CONSTRAINT recruitment_offer_revision_type_check,
  ADD CONSTRAINT recruitment_employment_letter_revision_type_check
    CHECK (supersedes_letter_id IS NULL OR letter_type IN ('offer', 'appointment'));

DROP INDEX recruitment.recruitment_employee_letter_type_unique;
CREATE UNIQUE INDEX recruitment_employee_letter_type_unique
  ON recruitment.employment_letters (
    organization_id, letter_type, lower(employee_code)
  )
  WHERE letter_type IN ('appointment', 'experience')
    AND employee_code IS NOT NULL AND supersedes_letter_id IS NULL;
