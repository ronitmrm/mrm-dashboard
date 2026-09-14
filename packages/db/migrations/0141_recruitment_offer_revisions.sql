-- Retain the original offer and each explicitly requested correction.
ALTER TABLE recruitment.employment_letters
  ADD COLUMN supersedes_letter_id uuid REFERENCES recruitment.employment_letters(id),
  ADD CONSTRAINT recruitment_offer_revision_type_check
    CHECK (supersedes_letter_id IS NULL OR letter_type = 'offer');

DROP INDEX recruitment.recruitment_offer_letter_application_unique;
CREATE UNIQUE INDEX recruitment_offer_letter_application_unique
  ON recruitment.employment_letters (organization_id, application_id)
  WHERE letter_type = 'offer' AND application_id IS NOT NULL
    AND supersedes_letter_id IS NULL;

CREATE UNIQUE INDEX recruitment_offer_revision_predecessor_unique
  ON recruitment.employment_letters (supersedes_letter_id)
  WHERE supersedes_letter_id IS NOT NULL;
