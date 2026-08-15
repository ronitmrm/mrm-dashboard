-- Department names can be renamed while keeping stable master identities.
-- When HR explicitly declines propagation, linked department selections are
-- cleared atomically and the affected records remain available for repair.

ALTER TABLE recruitment.posts
  ALTER COLUMN department_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION recruitment.rename_department_master(
  requested_organization_id uuid,
  requested_department_id uuid,
  requested_name text,
  requested_clear_references boolean,
  requested_actor_user_id uuid
)
RETURNS TABLE (
  id uuid,
  previous_name text,
  cleared_post_count integer,
  cleared_template_count integer,
  cleared_candidate_count integer,
  updated_job_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  prior_name text;
  affected_candidate_count integer := 0;
  affected_post_count integer := 0;
  affected_template_count integer := 0;
  affected_job_count integer := 0;
BEGIN
  IF nullif(btrim(requested_name), '') IS NULL THEN
    RAISE EXCEPTION 'Department name is required.';
  END IF;

  SELECT department.name
  INTO prior_name
  FROM recruitment.departments AS department
  WHERE department.id = requested_department_id
    AND department.organization_id = requested_organization_id
    AND department.active
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department was not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM recruitment.departments AS other_department
    WHERE other_department.organization_id = requested_organization_id
      AND other_department.id <> requested_department_id
      AND other_department.active
      AND lower(btrim(other_department.name)) = lower(btrim(requested_name))
  ) THEN
    RAISE EXCEPTION 'Department name "%" is already used.', btrim(requested_name);
  END IF;

  IF lower(btrim(prior_name)) = lower(btrim(requested_name)) THEN
    RAISE EXCEPTION 'Enter a different department name.';
  END IF;

  UPDATE recruitment.job_posts AS job
  SET title = CASE
      WHEN requested_clear_references THEN designation.name
      ELSE designation.name || ' / ' || btrim(requested_name)
    END,
    updated_by_user_id = requested_actor_user_id,
    updated_at = now(),
    row_version = job.row_version + 1
  FROM recruitment.posts AS post
  JOIN recruitment.designations AS designation
    ON designation.id = post.designation_id
  WHERE job.organization_id = requested_organization_id
    AND job.post_id = post.id
    AND post.organization_id = requested_organization_id
    AND post.department_id = requested_department_id
    AND post.combined_role_id IS NULL;
  GET DIAGNOSTICS affected_job_count = ROW_COUNT;

  IF requested_clear_references THEN
    SELECT count(DISTINCT affected.candidate_id)::integer
    INTO affected_candidate_count
    FROM (
      SELECT candidate.id AS candidate_id
      FROM recruitment.candidates AS candidate
      WHERE candidate.organization_id = requested_organization_id
        AND candidate.preferred_department_id = requested_department_id
      UNION
      SELECT link.candidate_id
      FROM recruitment.candidate_departments AS link
      JOIN recruitment.candidates AS candidate
        ON candidate.id = link.candidate_id
      WHERE candidate.organization_id = requested_organization_id
        AND link.department_id = requested_department_id
    ) AS affected;

    UPDATE recruitment.candidates AS candidate
    SET preferred_department_id = NULL,
      updated_by_user_id = requested_actor_user_id,
      updated_at = now(),
      row_version = candidate.row_version + 1
    WHERE candidate.organization_id = requested_organization_id
      AND candidate.preferred_department_id = requested_department_id;

    DELETE FROM recruitment.candidate_departments AS link
    USING recruitment.candidates AS candidate
    WHERE candidate.id = link.candidate_id
      AND candidate.organization_id = requested_organization_id
      AND link.department_id = requested_department_id;

    UPDATE recruitment.requirement_templates AS template
    SET department_id = NULL,
      updated_by_user_id = requested_actor_user_id,
      updated_at = now(),
      row_version = template.row_version + 1
    WHERE template.organization_id = requested_organization_id
      AND template.department_id = requested_department_id;
    GET DIAGNOSTICS affected_template_count = ROW_COUNT;

    UPDATE recruitment.posts AS post
    SET department_id = NULL,
      updated_by_user_id = requested_actor_user_id,
      updated_at = now(),
      row_version = post.row_version + 1
    WHERE post.organization_id = requested_organization_id
      AND post.department_id = requested_department_id;
    GET DIAGNOSTICS affected_post_count = ROW_COUNT;
  END IF;

  UPDATE recruitment.departments AS department
  SET name = btrim(requested_name),
    updated_by_user_id = requested_actor_user_id,
    updated_at = now(),
    row_version = department.row_version + 1
  WHERE department.id = requested_department_id
    AND department.organization_id = requested_organization_id;

  RETURN QUERY SELECT
    requested_department_id,
    prior_name,
    affected_post_count,
    affected_template_count,
    affected_candidate_count,
    affected_job_count;
END;
$$;

REVOKE ALL ON FUNCTION recruitment.rename_department_master(
  uuid, uuid, text, boolean, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION recruitment.rename_department_master(
  uuid, uuid, text, boolean, uuid
) TO mrmpl_web;
