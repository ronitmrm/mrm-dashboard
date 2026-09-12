-- Narrow deletion API: the web role never receives direct table DELETE access.
CREATE FUNCTION recruitment.delete_combined_role(
  requested_organization_id uuid,
  requested_combined_role_id uuid,
  requested_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  target_role recruitment.combined_roles%ROWTYPE;
  member_ids uuid[];
  members jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    requested_organization_id::text || ':combined-roles', 0));
  SELECT * INTO target_role FROM recruitment.combined_roles
  WHERE id = requested_combined_role_id
    AND organization_id = requested_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combined role was not found.';
  END IF;

  SELECT coalesce(array_agg(post.id), '{}'::uuid[]) INTO member_ids
  FROM recruitment.posts post
  WHERE post.combined_role_id = requested_combined_role_id
     OR EXISTS (SELECT 1 FROM recruitment.combined_role_posts link
       WHERE link.combined_role_id = requested_combined_role_id
         AND link.post_id = post.id);
  PERFORM 1 FROM recruitment.posts
  WHERE id = ANY(member_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM recruitment.posts
    WHERE id = ANY(member_ids) AND organization_id <> requested_organization_id) THEN
    RAISE EXCEPTION 'Combined-role members belong to another organization.';
  END IF;

  IF EXISTS (SELECT 1 FROM recruitment.job_posts WHERE post_id = ANY(member_ids)) THEN
    RAISE EXCEPTION 'This combined role cannot be deleted because a member post has a linked job post.';
  END IF;
  IF EXISTS (SELECT 1 FROM recruitment.post_replacements
    WHERE post_id = ANY(member_ids) AND status = 'Pending') THEN
    RAISE EXCEPTION 'Confirm or cancel the pending replacement before deleting this combined role.';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(link)), '[]'::jsonb) INTO members
  FROM recruitment.combined_role_posts link
  WHERE link.combined_role_id = requested_combined_role_id;
  INSERT INTO audit.events (
    organization_id, event_type, target_schema, target_table, target_id,
    actor_user_id, reason, before_state, metadata,
    source_system, source_table, source_id
  ) VALUES (
    requested_organization_id, 'recruitment.combined_role.deleted',
    'recruitment', 'combined_roles', requested_combined_role_id,
    requested_actor_user_id, 'Deleted from Combined Approved Posts',
    to_jsonb(target_role), jsonb_build_object('members', members),
    'mrm-dashboard', 'recruitment_events', gen_random_uuid()::text
  );

  UPDATE recruitment.posts
  SET combined_role_id = NULL, vacancy_code = post_code,
    updated_by_user_id = requested_actor_user_id, updated_at = now(),
    row_version = row_version + 1
  WHERE combined_role_id = requested_combined_role_id
    AND organization_id = requested_organization_id;
  UPDATE recruitment.requirement_templates
  SET combined_role_id = NULL,
    updated_by_user_id = requested_actor_user_id, updated_at = now(),
    row_version = row_version + 1
  WHERE combined_role_id = requested_combined_role_id
    AND organization_id = requested_organization_id;
  DELETE FROM recruitment.combined_role_posts
  WHERE combined_role_id = requested_combined_role_id;
  DELETE FROM recruitment.combined_roles
  WHERE id = requested_combined_role_id AND organization_id = requested_organization_id;
END;
$$;
REVOKE ALL ON FUNCTION recruitment.delete_combined_role(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recruitment.delete_combined_role(uuid, uuid, uuid) TO mrmpl_web;

INSERT INTO identity.permissions (key, module, name, description)
VALUES ('masters.universal.combined_approved_posts.delete', 'masters',
  'Universal / Combined Approved Posts / delete',
  'Delete a combined grouping while retaining individual approved posts.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id FROM identity.roles role
CROSS JOIN identity.permissions permission
WHERE role.key = 'administrator'
  AND permission.key = 'masters.universal.combined_approved_posts.delete'
ON CONFLICT DO NOTHING;
