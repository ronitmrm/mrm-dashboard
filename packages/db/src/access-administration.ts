import { appendAccessAuditChanges } from "./access-audit"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

type CreateRoleInput = {
  actorUserId: string
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

type DeleteRoleInput = {
  actorUserId: string
  confirmation: string
  roleId: string
}

type EmployeeReference = {
  employeeCode: string
  organizationId: string
}

type LinkEmployeeUserInput = EmployeeReference & {
  accountOrigin: "existing" | "new"
  actorUserId: string
  userId: string
}

type SetPostRoleInput = {
  actorUserId: string
  enabled: boolean
  postId: string
  roleKey: string
}

type SetPermissionOverrideInput = {
  actorUserId: string
  effect: "allow" | "deny"
  expiresAt?: Date
  permissionKey: string
  reason?: string
  userId: string
}

type UpdateRolePermissionsInput = {
  actorUserId: string
  permissionKeys: string[]
  roleKey: string
}

type UserRow = {
  better_auth_role: string | null
  email: string
  id: string
  name: string
  role_keys: string[]
}

type EmployeeAccessRow = {
  departments: string[]
  designations: string[]
  employee_code: string
  employee_name: string
  linked_user_id: string | null
  organization_id: string
  organization_name: string
  post_codes: string[]
  post_ids: string[]
}

type PostAccessProfileRow = {
  department: string
  designation: string
  id: string
  post_code: string
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
  options: RepositoryPoolOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async replaceDirectRoles({
      actorUserId,
      roleKeys,
      userId,
    }: {
      actorUserId: string
      roleKeys: string[]
      userId: string
    }) {
      const uniqueKeys = [...new Set(roleKeys)].sort()
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const user = await client.query(
          "SELECT id FROM identity.users WHERE id = $1 FOR UPDATE",
          [userId]
        )
        if (!user.rowCount)
          throw new Error("The selected staff account no longer exists")
        const roles = await client.query<{ id: string; key: string }>(
          `SELECT id, key FROM identity.roles
           WHERE key = ANY($1::text[]) AND NOT is_system
           ORDER BY key FOR SHARE`,
          [uniqueKeys]
        )
        if (roles.rows.length !== uniqueKeys.length) {
          throw new Error("Select existing non-system application roles")
        }
        const current = await client.query<{ id: string; key: string }>(
          `SELECT roles.id, roles.key
           FROM identity.user_roles
           JOIN identity.roles ON roles.id = user_roles.role_id
           WHERE user_roles.user_id = $1 AND NOT roles.is_system
           ORDER BY roles.key`,
          [userId]
        )
        const selectedKeys = new Set(roles.rows.map((role) => role.key))
        const currentKeys = new Set(current.rows.map((role) => role.key))
        const removed = current.rows.filter(
          (role) => !selectedKeys.has(role.key)
        )
        const assigned = roles.rows.filter((role) => !currentKeys.has(role.key))
        if (removed.length) {
          await client.query(
            `DELETE FROM identity.user_roles
             WHERE user_id = $1 AND role_id = ANY($2::uuid[])`,
            [userId, removed.map((role) => role.id)]
          )
        }
        if (assigned.length) {
          await client.query(
            `INSERT INTO identity.user_roles (
               user_id, role_id, assigned_by_user_id
             )
             SELECT $1, unnest($2::uuid[]), $3`,
            [userId, assigned.map((role) => role.id), actorUserId]
          )
        }
        const auditChanges = [
          ...removed.map((role) => ({
            actorUserId,
            eventType: "access.role.removed",
            metadata: { roleKey: role.key },
            targetId: userId,
            targetTable: "users",
          })),
          ...assigned.map((role) => ({
            actorUserId,
            eventType: "access.role.assigned",
            metadata: { roleKey: role.key },
            targetId: userId,
            targetTable: "users",
          })),
        ]
        if (auditChanges.length) {
          await appendAccessAuditChanges(client, auditChanges)
        }
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async createRole({
      actorUserId,
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
        await appendAccessAuditChanges(client, [
          {
            actorUserId,
            eventType: "access.role.created",
            metadata: { key, name },
            targetId: roleId,
            targetTable: "roles",
          },
          ...permissionKeys.map((permissionKey) => ({
            actorUserId,
            eventType: "access.role.capability_granted",
            metadata: { permissionKey, roleKey: key },
            targetId: roleId,
            targetTable: "roles",
          })),
        ])
        await client.query("COMMIT")

        return { id: roleId, key }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async deleteRole({ actorUserId, confirmation, roleId }: DeleteRoleInput) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        // Lock the immutable ID so a newly recreated role cannot be deleted by a stale form.
        const result = await client.query<{
          id: string
          key: string
          name: string
          description: string | null
          is_system: boolean
        }>(
          `SELECT id, key, name, description, is_system
           FROM identity.roles WHERE id = $1 FOR UPDATE`,
          [roleId]
        )
        const role = result.rows[0]
        if (!role) throw new Error("The selected role no longer exists")
        if (role.is_system) throw new Error("System roles cannot be deleted")
        if (confirmation !== role.key)
          throw new Error("Role key confirmation does not match")

        const grants = await client.query<{
          permission_keys: string[]
          user_ids: string[]
          post_ids: string[]
        }>(
          `SELECT
             ARRAY(SELECT p.key FROM identity.role_permissions rp
               JOIN identity.permissions p ON p.id = rp.permission_id
               WHERE rp.role_id = $1 ORDER BY p.key) AS permission_keys,
             ARRAY(SELECT user_id::text FROM identity.user_roles
               WHERE role_id = $1 ORDER BY user_id) AS user_ids,
             ARRAY(SELECT post_id::text FROM identity.post_role_assignments
               WHERE role_id = $1 ORDER BY post_id) AS post_ids`,
          [roleId]
        )
        await appendAccessAuditChanges(client, [
          {
            actorUserId,
            eventType: "access.role.deleted",
            metadata: {
              roleKey: role.key,
              name: role.name,
              description: role.description,
              ...grants.rows[0],
            },
            targetId: roleId,
            targetTable: "roles",
          },
        ])
        // Foreign keys remove only this role's permissions and direct/post assignments.
        await client.query("DELETE FROM identity.roles WHERE id = $1", [roleId])
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async assignRole({ actorUserId, roleKey, userId }: AssignRoleInput) {
      const client = await pool.connect()

      try {
        await client.query("BEGIN")
        const result = await client.query(
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
        await appendAccessAuditChanges(client, [
          {
            actorUserId,
            eventType: "access.role.assigned",
            metadata: { roleKey },
            targetId: userId,
            targetTable: "users",
          },
        ])
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async updateRolePermissions({
      actorUserId,
      permissionKeys,
      roleKey,
    }: UpdateRolePermissionsInput) {
      const uniquePermissionKeys = [...new Set(permissionKeys)].sort()
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const role = await client.query<{ id: string }>(
          `SELECT id
           FROM identity.roles
           WHERE key = $1 AND NOT is_system
           FOR UPDATE`,
          [roleKey]
        )
        if (!role.rows[0]) {
          throw new Error("The selected editable role does not exist")
        }
        const permissions = await client.query<{ id: string; key: string }>(
          `SELECT id, key
           FROM identity.permissions
           WHERE key = ANY($1::text[])
           ORDER BY key`,
          [uniquePermissionKeys]
        )
        if (permissions.rows.length !== uniquePermissionKeys.length) {
          const found = new Set(permissions.rows.map((row) => row.key))
          const missing = uniquePermissionKeys.filter((key) => !found.has(key))
          throw new Error(`Unknown capabilities: ${missing.join(", ")}`)
        }
        await client.query(
          "DELETE FROM identity.role_permissions WHERE role_id = $1",
          [role.rows[0].id]
        )
        await client.query(
          `INSERT INTO identity.role_permissions (role_id, permission_id)
           SELECT $1, permission.id
           FROM identity.permissions permission
           WHERE permission.key = ANY($2::text[])`,
          [role.rows[0].id, uniquePermissionKeys]
        )
        await appendAccessAuditChanges(client, [
          {
            actorUserId,
            eventType: "access.role.capabilities_replaced",
            metadata: { permissionKeys: uniquePermissionKeys, roleKey },
            targetId: role.rows[0].id,
            targetTable: "roles",
          },
        ])
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async employeeForAccount({
      employeeCode,
      organizationId,
    }: EmployeeReference) {
      const result = await pool.query<{
        employee_code: string
        employee_name: string
        linked_user_id: string | null
      }>(
        `SELECT
           max(btrim(posts.employee_code)) AS employee_code,
           max(btrim(posts.employee_name)) AS employee_name,
           max(employee_links.user_id::text) AS linked_user_id
         FROM recruitment.posts
         LEFT JOIN identity.employee_links
           ON employee_links.organization_id = posts.organization_id
          AND lower(btrim(employee_links.employee_code)) =
            lower(btrim(posts.employee_code))
         WHERE posts.organization_id = $1
           AND lower(btrim(posts.employee_code)) = lower(btrim($2))
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
         HAVING count(*) > 0`,
        [organizationId, employeeCode]
      )
      const employee = result.rows[0]
      if (!employee) {
        throw new Error("The selected active employee does not exist")
      }
      if (employee.linked_user_id) {
        throw new Error("The selected employee already has a login account")
      }
      return {
        employeeCode: employee.employee_code,
        name: employee.employee_name,
        organizationId,
      }
    },

    async linkEmployeeUser({
      accountOrigin,
      actorUserId,
      employeeCode,
      organizationId,
      userId,
    }: LinkEmployeeUserInput) {
      const client = await pool.connect()

      try {
        await client.query("BEGIN")
        const result = await client.query(
          `INSERT INTO identity.employee_links (
             user_id,
             organization_id,
             employee_code,
             linked_by_user_id
           )
           SELECT users.id, posts.organization_id,
             max(btrim(posts.employee_code)), $1
           FROM identity.users AS users
           CROSS JOIN recruitment.posts
           WHERE users.id = $2
             AND users.role IS DISTINCT FROM 'admin'
             AND posts.organization_id = $3
             AND lower(btrim(posts.employee_code)) = lower(btrim($4))
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
           GROUP BY users.id, posts.organization_id`,
          [actorUserId, userId, organizationId, employeeCode]
        )
        if (result.rowCount !== 1) {
          throw new Error("The selected user or active employee does not exist")
        }
        await appendAccessAuditChanges(client, [
          {
            actorUserId,
            eventType: "access.employee.linked",
            metadata: { employeeCode, organizationId },
            targetId: userId,
            targetTable: "users",
          },
          ...(accountOrigin === "new"
            ? [
                {
                  actorUserId,
                  eventType: "access.user.provisioned",
                  metadata: { employeeCode, organizationId },
                  targetId: userId,
                  targetTable: "users",
                },
              ]
            : []),
        ])
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async setPostRole({
      actorUserId,
      enabled,
      postId,
      roleKey,
    }: SetPostRoleInput) {
      const client = await pool.connect()

      try {
        await client.query("BEGIN")
        if (!enabled) {
          const result = await client.query(
            `DELETE FROM identity.post_role_assignments
             USING identity.roles
             WHERE post_role_assignments.post_id = $1
               AND post_role_assignments.role_id = roles.id
               AND roles.key = $2`,
            [postId, roleKey]
          )
          if (result.rowCount === 1) {
            await appendAccessAuditChanges(client, [
              {
                actorUserId,
                eventType: "access.post_role.removed",
                metadata: { roleKey },
                targetId: postId,
                targetSchema: "recruitment",
                targetTable: "posts",
              },
            ])
          }
          await client.query("COMMIT")
          return
        }

        const result = await client.query(
          `INSERT INTO identity.post_role_assignments (
             post_id,
             role_id,
             assigned_by_user_id
           )
           SELECT posts.id, roles.id, $1
           FROM recruitment.posts
           CROSS JOIN identity.roles
           WHERE posts.id = $2
             AND posts.status <> 'Inactive'
             AND roles.key = $3
             AND NOT roles.is_system
           ON CONFLICT (post_id, role_id) DO UPDATE
           SET assigned_by_user_id = EXCLUDED.assigned_by_user_id,
               assigned_at = now()`,
          [actorUserId, postId, roleKey]
        )
        if (result.rowCount !== 1) {
          throw new Error("The selected active post or role does not exist")
        }
        await appendAccessAuditChanges(client, [
          {
            actorUserId,
            eventType: "access.post_role.assigned",
            metadata: { roleKey },
            targetId: postId,
            targetSchema: "recruitment",
            targetTable: "posts",
          },
        ])
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
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
      const client = await pool.connect()

      try {
        await client.query("BEGIN")
        const result = await client.query(
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
        await appendAccessAuditChanges(client, [
          {
            actorUserId,
            eventType: "access.permission.override_set",
            metadata: { effect, expiresAt, permissionKey },
            reason,
            targetId: userId,
            targetTable: "users",
          },
        ])
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async getSnapshot() {
      const [users, overrides, roles, permissions, employees, postProfiles] =
        await Promise.all([
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
          pool.query<EmployeeAccessRow>(
            `SELECT
             posts.organization_id,
             organizations.name AS organization_name,
             btrim(posts.employee_code) AS employee_code,
             max(btrim(posts.employee_name)) AS employee_name,
             COALESCE(
               array_agg(DISTINCT departments.name ORDER BY departments.name)
                 FILTER (WHERE departments.name IS NOT NULL),
               ARRAY[]::text[]
             ) AS departments,
             array_agg(DISTINCT designations.name ORDER BY designations.name)
               AS designations,
             array_agg(DISTINCT posts.post_code ORDER BY posts.post_code)
               AS post_codes,
             array_agg(DISTINCT posts.id::text ORDER BY posts.id::text)
               AS post_ids,
             max(employee_links.user_id::text) AS linked_user_id
           FROM recruitment.posts
           JOIN core.organizations
             ON organizations.id = posts.organization_id
           LEFT JOIN recruitment.departments
             ON departments.id = posts.department_id
           JOIN recruitment.designations
             ON designations.id = posts.designation_id
           LEFT JOIN identity.employee_links
             ON employee_links.organization_id = posts.organization_id
            AND lower(btrim(employee_links.employee_code)) =
              lower(btrim(posts.employee_code))
           WHERE nullif(btrim(posts.employee_code), '') IS NOT NULL
             AND nullif(btrim(posts.employee_name), '') IS NOT NULL
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
           GROUP BY posts.organization_id, organizations.name,
             btrim(posts.employee_code)
           ORDER BY lower(max(btrim(posts.employee_name))),
             lower(btrim(posts.employee_code))`
          ),
          pool.query<PostAccessProfileRow>(
            `SELECT
             posts.id,
             posts.post_code,
             COALESCE(departments.name, '') AS department,
             designations.name AS designation,
             COALESCE(
               array_agg(roles.key ORDER BY roles.key)
                 FILTER (WHERE roles.key IS NOT NULL),
               ARRAY[]::text[]
             ) AS role_keys
           FROM recruitment.posts
           LEFT JOIN recruitment.departments
             ON departments.id = posts.department_id
           JOIN recruitment.designations
             ON designations.id = posts.designation_id
           LEFT JOIN identity.post_role_assignments
             ON post_role_assignments.post_id = posts.id
           LEFT JOIN identity.roles
             ON roles.id = post_role_assignments.role_id
           WHERE posts.status <> 'Inactive'
           GROUP BY posts.id, departments.name, designations.name
           ORDER BY lower(COALESCE(departments.name, '')),
             lower(designations.name),
             lower(posts.post_code)`
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

      const employeesByUser = new Map(
        employees.rows
          .filter((employee) => employee.linked_user_id)
          .map((employee) => [employee.linked_user_id!, employee])
      )
      const occupantsByPost = new Map(
        employees.rows.flatMap((employee) =>
          employee.post_ids.map(
            (postId) =>
              [
                postId,
                {
                  employeeCode: employee.employee_code,
                  employeeName: employee.employee_name,
                  linkedUserId: employee.linked_user_id,
                },
              ] as const
          )
        )
      )
      const roleKeysByPost = new Map(
        postProfiles.rows.map((profile) => [profile.id, profile.role_keys])
      )

      return {
        employees: employees.rows.map((row) => ({
          departments: row.departments,
          designations: row.designations,
          employeeCode: row.employee_code,
          employeeName: row.employee_name,
          linkedUserId: row.linked_user_id,
          organizationId: row.organization_id,
          organizationName: row.organization_name,
          postCodes: row.post_codes,
        })),
        permissions: permissions.rows,
        postAccessProfiles: postProfiles.rows.map((row) => ({
          department: row.department,
          designation: row.designation,
          id: row.id,
          occupant: occupantsByPost.get(row.id) ?? null,
          postCode: row.post_code,
          roleKeys: row.role_keys,
        })),
        roles: roles.rows.map((row) => ({
          description: row.description,
          id: row.id,
          isSystem: row.is_system,
          key: row.key,
          name: row.name,
          permissionKeys: row.permission_keys,
        })),
        users: users.rows.map((row) => {
          const employee = employeesByUser.get(row.id)
          return {
            betterAuthRole: row.better_auth_role,
            email: row.email,
            employee: employee
              ? {
                  departments: employee.departments,
                  employeeCode: employee.employee_code,
                  inheritedRoleKeys: [
                    ...new Set(
                      employee.post_ids.flatMap(
                        (postId) => roleKeysByPost.get(postId) ?? []
                      )
                    ),
                  ].sort(),
                  postCodes: employee.post_codes,
                }
              : null,
            id: row.id,
            name: row.name,
            overrides: overridesByUser.get(row.id) ?? [],
            roleKeys: row.role_keys,
          }
        }),
      }
    },
  }
}
