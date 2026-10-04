-- Shift details belong to the reusable description and are copied to new jobs.
-- Existing templates and jobs stay blank until their shifts are entered.
ALTER TABLE recruitment.requirement_templates
  ADD COLUMN shift_type text,
  ADD COLUMN shift_start_time time,
  ADD COLUMN shift_end_time time,
  ADD CONSTRAINT requirement_template_shift_type_check
    CHECK (shift_type IS NULL OR shift_type IN ('Day', 'Night', 'Rotation')),
  ADD CONSTRAINT requirement_template_shift_complete_check
    CHECK (
      (shift_type IS NULL AND shift_start_time IS NULL AND shift_end_time IS NULL)
      OR
      (shift_type IS NOT NULL AND shift_start_time IS NOT NULL AND shift_end_time IS NOT NULL)
    );

ALTER TABLE recruitment.job_posts
  ADD COLUMN shift_type text,
  ADD CONSTRAINT job_post_shift_type_check
    CHECK (shift_type IS NULL OR shift_type IN ('Day', 'Night', 'Rotation'));
