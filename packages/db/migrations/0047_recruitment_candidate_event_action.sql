-- Keep direct deletion from recruitment tables unavailable to the web role.
-- Conversation history is deleted through this organization-scoped action,
-- which returns the deleted row so the repository can retain audit evidence.

CREATE OR REPLACE FUNCTION recruitment.delete_candidate_event(
  requested_organization_id uuid,
  requested_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  deleted_event jsonb;
BEGIN
  DELETE FROM recruitment.candidate_events AS candidate_event
  WHERE candidate_event.id = requested_event_id
    AND candidate_event.organization_id = requested_organization_id
  RETURNING to_jsonb(candidate_event) INTO deleted_event;

  IF deleted_event IS NULL THEN
    RAISE EXCEPTION 'Conversation log was not found.';
  END IF;

  RETURN deleted_event;
END;
$$;

REVOKE ALL ON FUNCTION recruitment.delete_candidate_event(uuid, uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION recruitment.delete_candidate_event(uuid, uuid)
  TO mrmpl_web;
