import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

type AuthorizationRepositoryOptions = RepositoryPoolOptions

export function createAuthorizationRepository(
  options: AuthorizationRepositoryOptions
) {
  const { close, pool } = repositoryPool(options)

  async function listGrantedCapabilities(
    userId: string,
    capabilities: readonly string[]
  ) {
    if (capabilities.length === 0) return []

    const result = await pool.query<{ key: string }>(
      `WITH requested_permissions AS (
         SELECT id, key
         FROM identity.permissions
         WHERE key = ANY($2::text[])
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
       )
       SELECT requested_permissions.key
       FROM requested_permissions
       LEFT JOIN active_overrides
         ON active_overrides.permission_id = requested_permissions.id
       LEFT JOIN role_grants
         ON role_grants.permission_id = requested_permissions.id
       WHERE NOT COALESCE(active_overrides.denied, false)
         AND (
           COALESCE(active_overrides.allowed, false)
           OR role_grants.permission_id IS NOT NULL
         )`,
      [userId, capabilities]
    )
    const granted = new Set(result.rows.map(({ key }) => key))
    return capabilities.filter((capability) => granted.has(capability))
  }

  return {
    close,

    async hasCapability(userId: string, capability: string) {
      return (await listGrantedCapabilities(userId, [capability])).length === 1
    },

    listGrantedCapabilities,
  }
}
