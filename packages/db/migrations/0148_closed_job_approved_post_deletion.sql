-- Preserve closed recruitment jobs while removing their approved-post link.
CREATE OR REPLACE FUNCTION recruitment.delete_approved_post(
  requested_organization_id uuid,
  requested_post_id uuid,
  requested_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  target_post recruitment.posts%ROWTYPE;
  detached_job_ids uuid[];
BEGIN
  SELECT * INTO target_post FROM recruitment.posts
  WHERE id = requested_post_id AND organization_id = requested_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved post was not found.';
  END IF;
  IF nullif(btrim(target_post.employee_name), '') IS NOT NULL
    OR nullif(btrim(target_post.employee_code), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Remove the employee assignment before deleting this approved post.';
  END IF;
  IF EXISTS (SELECT 1 FROM recruitment.combined_role_posts WHERE post_id = requested_post_id) THEN
    RAISE EXCEPTION 'Edit the combined role and remove this post from it before deleting the approved post.';
  END IF;

  -- Serialize with job status changes before checking and detaching links.
  PERFORM 1 FROM recruitment.job_posts
  WHERE post_id = requested_post_id ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM recruitment.job_posts
    WHERE post_id = requested_post_id AND status <> 'Closed') THEN
    RAISE EXCEPTION 'Close the linked job post before deleting this approved post.';
  END IF;

  WITH detached AS (
    UPDATE recruitment.job_posts
    SET post_id = NULL, updated_at = now(),
      updated_by_user_id = requested_actor_user_id, row_version = row_version + 1
    WHERE post_id = requested_post_id AND status = 'Closed'
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO detached_job_ids FROM detached;

  INSERT INTO audit.events (
    organization_id, event_type, target_schema, target_table, target_id,
    actor_user_id, reason, before_state, metadata,
    source_system, source_table, source_id
  ) VALUES (
    requested_organization_id, 'recruitment.post.deleted', 'recruitment',
    'posts', requested_post_id, requested_actor_user_id,
    'Deleted from the Approved Posts screen', to_jsonb(target_post),
    jsonb_build_object('postCode', target_post.post_code, 'detachedJobIds', detached_job_ids),
    'mrm-dashboard', 'recruitment_events', gen_random_uuid()::text
  );
  DELETE FROM recruitment.posts
  WHERE id = requested_post_id AND organization_id = requested_organization_id;
END;
$$;
