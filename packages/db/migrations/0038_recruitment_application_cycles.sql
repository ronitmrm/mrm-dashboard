ALTER TABLE recruitment.applications
  DROP CONSTRAINT applications_candidate_id_job_post_id_key;

CREATE UNIQUE INDEX recruitment_applications_one_active_candidate_job_idx
  ON recruitment.applications (candidate_id, job_post_id)
  WHERE status IN ('Assigned', 'Interview', 'Hold');
