-- Keep direct deletion from recruitment tables unavailable to the web role.
-- Candidate saves replace one department link through this organization-scoped
-- security-definer action instead.

CREATE OR REPLACE FUNCTION recruitment.replace_candidate_department(
  requested_organization_id uuid,
  requested_candidate_id uuid,
  requested_department_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM 1
  FROM recruitment.candidates candidate
  WHERE candidate.id = requested_candidate_id
    AND candidate.organization_id = requested_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate was not found.';
  END IF;

  IF requested_department_id IS NOT NULL THEN
    PERFORM 1
    FROM recruitment.departments department
    WHERE department.id = requested_department_id
      AND department.organization_id = requested_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Preferred department was not found in the master.';
    END IF;
  END IF;

  DELETE FROM recruitment.candidate_departments link
  WHERE link.candidate_id = requested_candidate_id;

  IF requested_department_id IS NOT NULL THEN
    INSERT INTO recruitment.candidate_departments (candidate_id, department_id)
    VALUES (requested_candidate_id, requested_department_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION recruitment.replace_candidate_department(uuid, uuid, uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION recruitment.replace_candidate_department(uuid, uuid, uuid)
  TO mrmpl_web;
