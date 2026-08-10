ALTER TABLE recruitment.candidates
  ADD COLUMN preferred_designation_id uuid
    REFERENCES recruitment.designations(id) ON DELETE RESTRICT;

CREATE INDEX recruitment_candidates_preferred_designation_idx
  ON recruitment.candidates (preferred_designation_id)
  WHERE preferred_designation_id IS NOT NULL;
