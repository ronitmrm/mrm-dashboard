-- The web role may replace answers only while a task is in progress.
CREATE FUNCTION maintenance.clear_draft_task_results(
  p_organization_id uuid,
  p_task_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM maintenance.tasks
    WHERE id = p_task_id
      AND organization_id = p_organization_id
      AND status = 'In Progress'
  ) THEN
    RAISE EXCEPTION 'Maintenance draft was not found.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM maintenance.task_results
  WHERE organization_id = p_organization_id AND task_id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION maintenance.clear_draft_task_results(uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION maintenance.clear_draft_task_results(uuid, uuid)
  TO mrmpl_web;
