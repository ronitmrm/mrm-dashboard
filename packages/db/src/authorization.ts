import { Pool } from "pg"

type AuthorizationRepositoryOptions = {
  connectionString: string
}

export function createAuthorizationRepository({
  connectionString,
}: AuthorizationRepositoryOptions) {
  const pool = new Pool({ connectionString })

  return {
    close: () => pool.end(),

    async hasCapability(userId: string, capability: string) {
      const result = await pool.query<{ allowed: boolean }>(
        `WITH requested_permission AS (
           SELECT id
           FROM identity.permissions
           WHERE key = $2
         ),
         active_override AS (
           SELECT overrides.effect
           FROM identity.user_permission_overrides AS overrides
           JOIN requested_permission
             ON requested_permission.id = overrides.permission_id
           WHERE overrides.user_id = $1
             AND (
               overrides.expires_at IS NULL
               OR overrides.expires_at > now()
             )
         )
         SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM active_override WHERE effect = 'deny'
           ) THEN false
           WHEN EXISTS (
             SELECT 1 FROM active_override WHERE effect = 'allow'
           ) THEN true
           ELSE EXISTS (
             SELECT 1
             FROM requested_permission
             JOIN identity.role_permissions
               ON role_permissions.permission_id = requested_permission.id
             JOIN identity.user_roles
               ON user_roles.role_id = role_permissions.role_id
             WHERE user_roles.user_id = $1
           )
         END AS allowed`,
        [userId, capability]
      )

      return result.rows[0]?.allowed ?? false
    },
  }
}
