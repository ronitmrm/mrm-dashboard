import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

type AccessAdministrationRepositoryOptions = RepositoryPoolOptions

type CreateRoleInput = {
  description?: string
  key: string
  name: string
  permissionKeys: string[]
}

type AssignRoleInput = {
  actorUserId: string
  roleKey: string
  userId: string
}

type SetPermissionOverrideInput = {
  actorUserId: string
  effect: "allow" | "deny"
  expiresAt?: Date
  permissionKey: string
  reason?: string
  userId: string
}

type UserRow = {
  better_auth_role: string | null
  email: string
  id: string
  name: string
  role_keys: string[]
}

type OverrideRow = {
  effect: "allow" | "deny"
  expires_at: Date | null
  permission_key: string
  reason: string | null
  user_id: string
}

type RoleRow = {
  description: string | null
  id: string
  is_system: boolean
  key: string
  name: string
  permission_keys: string[]
}

type PermissionRow = {
  description: string | null
  key: string
  module: string
  name: string
}

export function createAccessAdministrationRepository(
  options: AccessAdministrationRepositoryOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async createRole({
      description,
      key,
      name,
      permissionKeys,
    }: CreateRoleInput) {
      const client = await pool.connect()

      try {
        await client.query("BEGIN")
        const permissions = await client.query<{ key: string }>(
          `SELECT key
           FROM identity.permissions
           WHERE key = ANY($1::text[])
           ORDER BY key`,
          [permissionKeys]
        )
        if (permissions.rows.length !== permissionKeys.length) {
          const found = new Set(permissions.rows.map((row) => row.key))
          const missing = permissionKeys.filter((item) => !found.has(item))
          throw new Error(`Unknown capabilities: ${missing.join(", ")}`)
        }

        const role = await client.query<{ id: string }>(
          `INSERT INTO identity.roles (key, name, description)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [key, name, description ?? null]
        )
        const roleId = role.rows[0]?.id
        if (!roleId) {
          throw new Error("The access role could not be created")
        }

        await client.query(
          `INSERT INTO identity.role_permissions (role_id, permission_id)
           SELECT $1, permissions.id
           FROM identity.permissions AS permissions
           WHERE permissions.key = ANY($2::text[])
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [roleId, permissionKeys]
        )
        await client.query("COMMIT")

        return { id: roleId, key }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async assignRole({ actorUserId, roleKey, userId }: AssignRoleInput) {
      const result = await pool.query(
        `INSERT INTO identity.user_roles (
           user_id,
           role_id,
           assigned_by_user_id
         )
         SELECT users.id, roles.id, $1
         FROM identity.users AS users
         CROSS JOIN identity.roles AS roles
         WHERE users.id = $2
           AND roles.key = $3
         ON CONFLICT (user_id, role_id) DO UPDATE
         SET assigned_by_user_id = EXCLUDED.assigned_by_user_id,
             assigned_at = now()`,
        [actorUserId, userId, roleKey]
      )

      if (result.rowCount !== 1) {
        throw new Error("The selected user or role does not exist")
      }
    },

    async setPermissionOverride({
      actorUserId,
      effect,
      expiresAt,
      permissionKey,
      reason,
      userId,
    }: SetPermissionOverrideInput) {
      const result = await pool.query(
        `INSERT INTO identity.user_permission_overrides (
           user_id,
           permission_id,
           effect,
           reason,
           assigned_by_user_id,
           expires_at
         )
         SELECT users.id, permissions.id, $1, $2, $3, $4
         FROM identity.users AS users
         CROSS JOIN identity.permissions AS permissions
         WHERE users.id = $5
           AND permissions.key = $6
         ON CONFLICT (user_id, permission_id) DO UPDATE
         SET effect = EXCLUDED.effect,
             reason = EXCLUDED.reason,
             assigned_by_user_id = EXCLUDED.assigned_by_user_id,
             assigned_at = now(),
             expires_at = EXCLUDED.expires_at`,
        [
          effect,
          reason ?? null,
          actorUserId,
          expiresAt ?? null,
          userId,
          permissionKey,
        ]
      )

      if (result.rowCount !== 1) {
        throw new Error("The selected user or capability does not exist")
      }
    },

    async getSnapshot() {
      const [users, overrides, roles, permissions] = await Promise.all([
        pool.query<UserRow>(
          `SELECT
             users.id,
             users.name,
             users.email,
             users.role AS better_auth_role,
             COALESCE(
               array_agg(roles.key ORDER BY roles.key)
                 FILTER (WHERE roles.key IS NOT NULL),
               ARRAY[]::text[]
             ) AS role_keys
           FROM identity.users AS users
           LEFT JOIN identity.user_roles
             ON user_roles.user_id = users.id
           LEFT JOIN identity.roles
             ON roles.id = user_roles.role_id
           GROUP BY users.id
           ORDER BY lower(users.name), lower(users.email)`
        ),
        pool.query<OverrideRow>(
          `SELECT
             overrides.user_id,
             permissions.key AS permission_key,
             overrides.effect,
             overrides.reason,
             overrides.expires_at
           FROM identity.user_permission_overrides AS overrides
           JOIN identity.permissions
             ON permissions.id = overrides.permission_id
           ORDER BY overrides.user_id, permissions.key`
        ),
        pool.query<RoleRow>(
          `SELECT
             roles.id,
             roles.key,
             roles.name,
             roles.description,
             roles.is_system,
             COALESCE(
               array_agg(permissions.key ORDER BY permissions.key)
                 FILTER (WHERE permissions.key IS NOT NULL),
               ARRAY[]::text[]
             ) AS permission_keys
           FROM identity.roles AS roles
           LEFT JOIN identity.role_permissions
             ON role_permissions.role_id = roles.id
           LEFT JOIN identity.permissions
             ON permissions.id = role_permissions.permission_id
           GROUP BY roles.id
           ORDER BY roles.is_system DESC, lower(roles.name)`
        ),
        pool.query<PermissionRow>(
          `SELECT key, module, name, description
           FROM identity.permissions
           ORDER BY module, name`
        ),
      ])
      const overridesByUser = new Map<
        string,
        Array<{
          effect: "allow" | "deny"
          expiresAt: Date | null
          permissionKey: string
          reason: string | null
        }>
      >()

      for (const row of overrides.rows) {
        const userOverrides = overridesByUser.get(row.user_id) ?? []
        userOverrides.push({
          effect: row.effect,
          expiresAt: row.expires_at,
          permissionKey: row.permission_key,
          reason: row.reason,
        })
        overridesByUser.set(row.user_id, userOverrides)
      }

      return {
        permissions: permissions.rows,
        roles: roles.rows.map((row) => ({
          description: row.description,
          id: row.id,
          isSystem: row.is_system,
          key: row.key,
          name: row.name,
          permissionKeys: row.permission_keys,
        })),
        users: users.rows.map((row) => ({
          betterAuthRole: row.better_auth_role,
          email: row.email,
          id: row.id,
          name: row.name,
          overrides: overridesByUser.get(row.id) ?? [],
          roleKeys: row.role_keys,
        })),
      }
    },
  }
}
