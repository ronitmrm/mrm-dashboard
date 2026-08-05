-- Keep direct table deletion unavailable to the web role. These narrowly
-- scoped security-definer functions repeat the critical integrity checks at
-- the database boundary before deleting an approved post or replacing the
-- membership of an active combined role.

CREATE OR REPLACE FUNCTION recruitment.delete_approved_post(
  requested_organization_id uuid,
  requested_post_id uuid,
  requested_actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_post recruitment.posts%ROWTYPE;
  combined_role_link_count integer;
  job_post_link_count integer;
BEGIN
  SELECT post.* INTO target_post
  FROM recruitment.posts post
  WHERE post.id = requested_post_id
    AND post.organization_id = requested_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved post was not found.';
  END IF;

  IF nullif(btrim(target_post.employee_name), '') IS NOT NULL
    OR nullif(btrim(target_post.employee_code), '') IS NOT NULL THEN
    RAISE EXCEPTION
      'Remove the employee assignment before deleting this approved post.';
  END IF;

  SELECT count(*)::integer INTO combined_role_link_count
  FROM recruitment.combined_role_posts link
  WHERE link.post_id = requested_post_id;

  IF combined_role_link_count > 0 THEN
    RAISE EXCEPTION
      'Edit the combined role and remove this post from it before deleting the approved post.';
  END IF;

  SELECT count(*)::integer INTO job_post_link_count
  FROM recruitment.job_posts job
  WHERE job.post_id = requested_post_id;

  IF job_post_link_count > 0 THEN
    RAISE EXCEPTION
      'This approved post cannot be deleted because a job post is linked to it.';
  END IF;

  INSERT INTO audit.events (
    organization_id, event_type, target_schema, target_table, target_id,
    actor_user_id, reason, before_state, metadata,
    source_system, source_table, source_id
  )
  VALUES (
    requested_organization_id, 'recruitment.post.deleted', 'recruitment',
    'posts', requested_post_id, requested_actor_user_id,
    'Deleted from the Approved Posts screen', to_jsonb(target_post),
    jsonb_build_object('postCode', target_post.post_code),
    'mrm-dashboard', 'recruitment_events', gen_random_uuid()::text
  );

  DELETE FROM recruitment.posts
  WHERE id = requested_post_id
    AND organization_id = requested_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION recruitment.clear_combined_role_members(
  requested_organization_id uuid,
  requested_combined_role_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM 1
  FROM recruitment.combined_roles combined
  WHERE combined.id = requested_combined_role_id
    AND combined.organization_id = requested_organization_id
    AND combined.status = 'Active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active combined role was not found.';
  END IF;

  DELETE FROM recruitment.combined_role_posts link
  WHERE link.combined_role_id = requested_combined_role_id;
END;
$$;

REVOKE ALL ON FUNCTION recruitment.delete_approved_post(uuid, uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION recruitment.clear_combined_role_members(uuid, uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION recruitment.delete_approved_post(uuid, uuid, uuid)
  TO mrmpl_web;
GRANT EXECUTE ON FUNCTION recruitment.clear_combined_role_members(uuid, uuid)
  TO mrmpl_web;
