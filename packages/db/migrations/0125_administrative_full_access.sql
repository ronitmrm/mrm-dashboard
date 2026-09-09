-- Administrative is the user-requested assignable full-access role.
-- Existing employee eligibility and permission override rules still apply.
CREATE FUNCTION identity.has_administrative_access(target_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  WITH active_posts AS (
    SELECT posts.id
    FROM identity.employee_links AS links
    JOIN recruitment.posts
      ON posts.organization_id = links.organization_id
     AND lower(btrim(posts.employee_code)) = lower(btrim(links.employee_code))
    WHERE links.user_id = target_user_id
      AND (posts.status = 'Occupied'
        OR (posts.status = 'Appointed' AND posts.joining_date <= current_date)
        OR (posts.status = 'Resigned' AND posts.last_working_date >= current_date))
  ), assigned_roles AS (
    SELECT role_id FROM identity.user_roles WHERE user_id = target_user_id
    UNION
    SELECT assignments.role_id
    FROM identity.post_role_assignments AS assignments
    JOIN active_posts ON active_posts.id = assignments.post_id
  )
  SELECT (
    NOT EXISTS (SELECT 1 FROM identity.employee_links WHERE user_id = target_user_id)
    OR EXISTS (SELECT 1 FROM active_posts)
  ) AND EXISTS (
    SELECT 1 FROM assigned_roles
    JOIN identity.roles ON roles.id = assigned_roles.role_id
    WHERE roles.key = 'administrative'
  );
$$;

UPDATE identity.roles
SET description = 'Full application access, including enquiries owned by any salesperson.',
    updated_at = now()
WHERE key = 'administrative';

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles
CROSS JOIN identity.permissions
WHERE roles.key = 'administrative'
ON CONFLICT (role_id, permission_id) DO NOTHING;
