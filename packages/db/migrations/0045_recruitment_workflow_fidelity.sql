-- Complete the recruitment employment and candidate-document workflow.

ALTER TABLE recruitment.posts
  ADD COLUMN IF NOT EXISTS last_working_date date;

ALTER TABLE recruitment.posts
  DROP CONSTRAINT IF EXISTS recruitment_posts_resignation_date_check;

ALTER TABLE recruitment.posts
  ADD CONSTRAINT recruitment_posts_resignation_date_check
  CHECK (status = 'Resigned' OR last_working_date IS NULL);

CREATE INDEX IF NOT EXISTS recruitment_posts_resignation_release_idx
  ON recruitment.posts (organization_id, last_working_date)
  WHERE status = 'Resigned' AND last_working_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS recruitment_candidate_events_register_idx
  ON recruitment.candidate_events (organization_id, occurred_at DESC, id DESC);
