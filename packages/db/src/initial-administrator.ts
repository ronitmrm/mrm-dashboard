import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"

type ProvisionerOptions = RepositoryPoolOptions

type PromoteAdministratorInput = {
  email: string
  userId: string
}

export function createInitialAdministratorProvisioner(
  options: ProvisionerOptions
) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async countUsers() {
      const result = await pool.query<{ count: string }>(
        "SELECT count(*) FROM identity.users"
      )

      return Number(result.rows[0]?.count ?? 0)
    },

    async promote({ email, userId }: PromoteAdministratorInput) {
      const client = await pool.connect()

      try {
        await client.query("BEGIN")
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('mrmpl-initial-administrator'))"
        )
        const users = await client.query<{ email: string; id: string }>(
          "SELECT id, email FROM identity.users ORDER BY created_at FOR UPDATE"
        )

        if (
          users.rows.length !== 1 ||
          users.rows[0]?.id !== userId ||
          users.rows[0]?.email.toLowerCase() !== email.toLowerCase()
        ) {
          throw new Error(
            "Initial administrator promotion requires exactly the newly provisioned Better Auth user"
          )
        }

        await client.query(
          "UPDATE identity.users SET role = 'admin', updated_at = now() WHERE id = $1",
          [userId]
        )
        const assignment = await client.query(
          `INSERT INTO identity.user_roles (user_id, role_id, assigned_by_user_id)
           SELECT $1, id, $1
           FROM identity.roles
           WHERE key = 'administrator'
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [userId]
        )

        if (assignment.rowCount !== 1) {
          throw new Error("The seeded administrator role is missing")
        }

        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async status(userId: string) {
      const result = await pool.query<{
        better_auth_role: string | null
        system_administrator: boolean
      }>(
        `SELECT
           users.role AS better_auth_role,
           EXISTS (
             SELECT 1
             FROM identity.user_roles
             JOIN identity.roles ON roles.id = user_roles.role_id
             WHERE user_roles.user_id = users.id
               AND roles.key = 'administrator'
           ) AS system_administrator
         FROM identity.users AS users
         WHERE users.id = $1`,
        [userId]
      )

      const row = result.rows[0]
      if (!row) {
        throw new Error("Provisioned administrator was not found")
      }

      return {
        betterAuthRole: row.better_auth_role,
        systemAdministrator: row.system_administrator,
      }
    },
  }
}
