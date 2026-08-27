-- Close recruitment openings through the normal UPDATE grant. Permanent
-- deletion remains unavailable directly and is exposed only for empty jobs.

CREATE OR REPLACE FUNCTION recruitment.delete_job_post(
  requested_organization_id uuid,
  requested_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  deleted_job jsonb;
BEGIN
  SELECT to_jsonb(job)
  INTO deleted_job
  FROM recruitment.job_posts AS job
  WHERE job.id = requested_job_id
    AND job.organization_id = requested_organization_id
  FOR UPDATE;

  IF deleted_job IS NULL THEN
    RAISE EXCEPTION 'Recruitment opening was not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM recruitment.applications AS application
    WHERE application.job_post_id = requested_job_id
      AND application.organization_id = requested_organization_id
  ) OR EXISTS (
    SELECT 1
    FROM recruitment.candidate_events AS candidate_event
    WHERE candidate_event.job_post_id = requested_job_id
      AND candidate_event.organization_id = requested_organization_id
  ) THEN
    RAISE EXCEPTION
      'A job with candidate history cannot be deleted. Close the job instead.';
  END IF;

  DELETE FROM recruitment.job_posts AS job
  WHERE job.id = requested_job_id
    AND job.organization_id = requested_organization_id;

  RETURN deleted_job;
END;
$$;

REVOKE ALL ON FUNCTION recruitment.delete_job_post(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recruitment.delete_job_post(uuid, uuid)
  TO mrmpl_web;

INSERT INTO identity.permissions (key, module, name, description)
VALUES
  (
    'hr.jobs.close',
    'hr',
    'Close Recruitment Opening',
    'Close an open Recruitment Opening while retaining candidate history.'
  ),
  (
    'hr.jobs.delete',
    'hr',
    'Delete Recruitment Opening',
    'Permanently delete a Recruitment Opening that has no candidate history.'
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles AS role
JOIN identity.permissions AS permission
  ON permission.key IN ('hr.jobs.close', 'hr.jobs.delete')
WHERE role.key = 'administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;
