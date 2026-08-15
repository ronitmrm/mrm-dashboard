import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

export function createAuthorizationRepository(
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  async function queryGrantedCapabilities(
    userId: string,
    capabilities?: readonly string[]
  ) {
    const requestedFilter = capabilities ? "WHERE key = ANY($2::text[])" : ""
    const result = await pool.query<{ key: string }>(
      `WITH requested_permissions AS (
         SELECT id, key
         FROM identity.permissions
         ${requestedFilter}
       ),
       active_employee_posts AS (
         SELECT posts.id
         FROM identity.employee_links
         JOIN recruitment.posts
           ON posts.organization_id = employee_links.organization_id
          AND lower(btrim(posts.employee_code)) =
            lower(btrim(employee_links.employee_code))
         WHERE employee_links.user_id = $1
           AND (
             posts.status = 'Occupied'
             OR (
               posts.status = 'Appointed'
               AND posts.joining_date <= current_date
             )
             OR (
               posts.status = 'Resigned'
               AND posts.last_working_date >= current_date
             )
           )
       ),
       active_overrides AS (
         SELECT overrides.permission_id,
           bool_or(overrides.effect = 'deny') AS denied,
           bool_or(overrides.effect = 'allow') AS allowed
         FROM identity.user_permission_overrides AS overrides
         JOIN requested_permissions
           ON requested_permissions.id = overrides.permission_id
         WHERE overrides.user_id = $1
           AND (
             overrides.expires_at IS NULL
             OR overrides.expires_at > now()
           )
         GROUP BY overrides.permission_id
       ),
       role_grants AS (
         SELECT DISTINCT role_permissions.permission_id
         FROM identity.role_permissions
         JOIN identity.user_roles
           ON user_roles.role_id = role_permissions.role_id
         JOIN requested_permissions
           ON requested_permissions.id = role_permissions.permission_id
         WHERE user_roles.user_id = $1
         UNION
         SELECT DISTINCT role_permissions.permission_id
         FROM active_employee_posts
         JOIN identity.post_role_assignments
           ON post_role_assignments.post_id = active_employee_posts.id
         JOIN identity.role_permissions
           ON role_permissions.role_id = post_role_assignments.role_id
         JOIN requested_permissions
           ON requested_permissions.id = role_permissions.permission_id
       )
       SELECT requested_permissions.key
       FROM requested_permissions
       LEFT JOIN active_overrides
         ON active_overrides.permission_id = requested_permissions.id
       LEFT JOIN role_grants
         ON role_grants.permission_id = requested_permissions.id
       WHERE (
           NOT EXISTS (
             SELECT 1 FROM identity.employee_links WHERE user_id = $1
           )
           OR EXISTS (SELECT 1 FROM active_employee_posts)
         )
         AND NOT COALESCE(active_overrides.denied, false)
         AND (
           COALESCE(active_overrides.allowed, false)
           OR role_grants.permission_id IS NOT NULL
         )`,
      capabilities ? [userId, capabilities] : [userId]
    )
    return result.rows.map(({ key }) => key)
  }

  async function listGrantedCapabilities(
    userId: string,
    capabilities: readonly string[]
  ) {
    if (capabilities.length === 0) return []

    const granted = new Set(
      await queryGrantedCapabilities(userId, capabilities)
    )
    return capabilities.filter((capability) => granted.has(capability))
  }

  return {
    close,

    async hasCapability(userId: string, capability: string) {
      return (await listGrantedCapabilities(userId, [capability])).length === 1
    },

    listAllGrantedCapabilities(userId: string) {
      return queryGrantedCapabilities(userId)
    },

    listGrantedCapabilities,
  }
}
