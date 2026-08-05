-- Model the approved-post employment lifecycle without a manually editable status.

ALTER TABLE recruitment.posts
  DROP CONSTRAINT IF EXISTS posts_status_check;

ALTER TABLE recruitment.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('Vacant', 'Appointed', 'Occupied', 'Resigned', 'Inactive'));
