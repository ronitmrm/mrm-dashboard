import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createAccessAdministrationRepository,
  createAuthorizationRepository,
  createInitialAdministratorProvisioner,
  migrateDatabase,
} from "@workspace/db"
import { Pool } from "pg"

import { createAccessAdministrationService } from "./access-administration"
import { createAuthSystem } from "./auth"
import { listGrantedCapabilities } from "./require-capability"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const originalDatabaseUrl = process.env.DATABASE_URL
const originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET
const pool = new Pool({ connectionString })
const organizationId = "10000000-0000-4000-8000-000000000001"
const departmentId = "10000000-0000-4000-8000-000000000002"
const designationId = "10000000-0000-4000-8000-000000000003"
const postId = "10000000-0000-4000-8000-000000000004"
const employeeCode = "ACCESS-EMP-001"

async function resetIdentity() {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await client.query(
      "DELETE FROM audit.events WHERE event_type LIKE 'access.%'"
    )
    await client.query("DELETE FROM identity.post_role_assignments")
    await client.query("DELETE FROM identity.employee_links")
    await client.query("DELETE FROM identity.user_permission_overrides")
    await client.query("DELETE FROM identity.user_roles")
    await client.query("DELETE FROM identity.sessions")
    await client.query("DELETE FROM identity.accounts")
    await client.query("DELETE FROM identity.users")
    await client.query("DELETE FROM identity.roles WHERE is_system = false")
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = connectionString
  process.env.BETTER_AUTH_SECRET = "test-only-better-auth-secret-000000000000"
  await migrateDatabase({ connectionString })
  await pool.query(
    `INSERT INTO core.organizations (id, code, name)
     VALUES ($1, 'ACCESS-TEST', 'Access Test Organization')
     ON CONFLICT (id) DO NOTHING`,
    [organizationId]
  )
  await pool.query(
    `INSERT INTO recruitment.departments (
       id, organization_id, code, name,
       source_system, source_table, source_id
     ) VALUES ($1, $2, 'ACCESS', 'Production', 'test', 'departments', $1::uuid::text)
     ON CONFLICT (id) DO NOTHING`,
    [departmentId, organizationId]
  )
  await pool.query(
    `INSERT INTO recruitment.designations (
       id, organization_id, code, name,
       source_system, source_table, source_id
     ) VALUES ($1, $2, 'PLANNER', 'Production Planner',
       'test', 'designations', $1::uuid::text)
     ON CONFLICT (id) DO NOTHING`,
    [designationId, organizationId]
  )
  await pool.query(
    `INSERT INTO recruitment.posts (
       id, organization_id, department_id, designation_id,
       vacancy_number, post_code, vacancy_code,
       employee_name, employee_code, status,
       source_system, source_table, source_id
     ) VALUES ($1, $2, $3, $4, '1', 'ACCESS-POST-001',
       'ACCESS-VAC-001', 'Production Planner', $5, 'Occupied',
       'test', 'posts', $1::uuid::text)
     ON CONFLICT (id) DO UPDATE SET
       employee_name = EXCLUDED.employee_name,
       employee_code = EXCLUDED.employee_code,
       status = EXCLUDED.status`,
    [postId, organizationId, departmentId, designationId, employeeCode]
  )
})

beforeEach(async () => {
  await resetIdentity()
})

afterAll(async () => {
  await resetIdentity()
  await pool.query("DELETE FROM recruitment.posts WHERE id = $1", [postId])
  await pool.query("DELETE FROM recruitment.designations WHERE id = $1", [
    designationId,
  ])
  await pool.query("DELETE FROM recruitment.departments WHERE id = $1", [
    departmentId,
  ])
  await pool.query("DELETE FROM core.organizations WHERE id = $1", [
    organizationId,
  ])
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseUrl
  if (originalBetterAuthSecret === undefined)
    delete process.env.BETTER_AUTH_SECRET
  else process.env.BETTER_AUTH_SECRET = originalBetterAuthSecret
  await pool.end()
})

describe("access administration", () => {
  it("lets a capable administrator provision a sign-in-ready staff account", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const access = createAccessAdministrationService({
      auth: system.auth,
      connectionString,
    })

    try {
      const administrator = await system.auth.api.signUpEmail({
        body: {
          email: "administrator@mrmpl.test",
          name: "System Administrator",
          password: "test-only-password",
        },
      })
      await provisioner.promote({
        email: administrator.user.email,
        userId: administrator.user.id,
      })

      const staff = await access.provisionStaff({
        actorUserId: administrator.user.id,
        email: "planner@mrmpl.test",
        employeeCode,
        organizationId,
        password: "planner-test-password",
      })

      expect(staff).toMatchObject({
        email: "planner@mrmpl.test",
        name: "Production Planner",
        role: "user",
      })
      await expect(
        system.auth.api.signInEmail({
          body: {
            email: "planner@mrmpl.test",
            password: "planner-test-password",
          },
        })
      ).resolves.toMatchObject({
        user: { id: staff.id },
      })

      const audit = await pool.query<{
        actor_user_id: string
        event_type: string
        target_id: string
      }>(
        `SELECT event_type, actor_user_id, target_id
         FROM audit.events
         WHERE target_id = ANY($1::uuid[])
         ORDER BY event_type`,
        [[administrator.user.id, staff.id]]
      )
      expect(audit.rows).toEqual(
        expect.arrayContaining([
          {
            actor_user_id: administrator.user.id,
            event_type: "access.initial_administrator.promoted",
            target_id: administrator.user.id,
          },
          {
            actor_user_id: administrator.user.id,
            event_type: "access.user.provisioned",
            target_id: staff.id,
          },
          {
            actor_user_id: administrator.user.id,
            event_type: "access.employee.linked",
            target_id: staff.id,
          },
        ])
      )

      await expect(
        access.provisionStaff({
          actorUserId: staff.id,
          email: "unauthorized@mrmpl.test",
          employeeCode,
          organizationId,
          password: "unauthorized-test-password",
        })
      ).rejects.toThrow("administration.staff.provision")
    } finally {
      await access.close()
      await provisioner.close()
      await system.close()
    }
  })

  it("applies role capabilities and explicit user overrides", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const access = createAccessAdministrationService({
      auth: system.auth,
      connectionString,
    })
    const otherInstanceAccess = createAccessAdministrationRepository({
      connectionString,
    })
    const authorization = createAuthorizationRepository({ connectionString })

    try {
      const administrator = await system.auth.api.signUpEmail({
        body: {
          email: "administrator@mrmpl.test",
          name: "System Administrator",
          password: "test-only-password",
        },
      })
      await provisioner.promote({
        email: administrator.user.email,
        userId: administrator.user.id,
      })
      const staff = await access.provisionStaff({
        actorUserId: administrator.user.id,
        email: "planner@mrmpl.test",
        employeeCode,
        organizationId,
        password: "planner-test-password",
      })

      await access.createRole({
        actorUserId: administrator.user.id,
        description: "Reads and manages the production plan",
        key: "production-planner",
        name: "Production planner",
        permissionKeys: ["planning.plan.read", "planning.priority.write"],
      })
      await access.assignRole({
        actorUserId: administrator.user.id,
        roleKey: "production-planner",
        userId: staff.id,
      })

      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(true)
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual(["planning.plan.read"])

      await pool.query(
        `DELETE FROM identity.user_roles
         WHERE user_id = $1
           AND role_id = (
             SELECT id FROM identity.roles WHERE key = 'production-planner'
           )`,
        [staff.id]
      )
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual([])

      await access.assignRole({
        actorUserId: administrator.user.id,
        roleKey: "production-planner",
        userId: staff.id,
      })
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual(["planning.plan.read"])

      await pool.query(
        `DELETE FROM identity.role_permissions
         WHERE role_id = (
             SELECT id FROM identity.roles WHERE key = 'production-planner'
           )
           AND permission_id = (
             SELECT id FROM identity.permissions WHERE key = 'planning.plan.read'
           )`
      )
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual([])

      await pool.query(
        `INSERT INTO identity.role_permissions (role_id, permission_id)
         SELECT roles.id, permissions.id
         FROM identity.roles AS roles
         CROSS JOIN identity.permissions AS permissions
         WHERE roles.key = 'production-planner'
           AND permissions.key = 'planning.plan.read'
         ON CONFLICT DO NOTHING`
      )
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual(["planning.plan.read"])

      await otherInstanceAccess.setPermissionOverride({
        actorUserId: administrator.user.id,
        effect: "deny",
        permissionKey: "planning.plan.read",
        reason: "Temporary training restriction",
        userId: staff.id,
      })
      await expect(
        listGrantedCapabilities(staff.id, ["planning.plan.read"])
      ).resolves.toEqual([])
      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(false)

      await access.setPermissionOverride({
        actorUserId: administrator.user.id,
        effect: "allow",
        permissionKey: "operations.dashboard.read",
        reason: "Cross-functional dashboard review",
        userId: staff.id,
      })
      await expect(
        authorization.hasCapability(staff.id, "operations.dashboard.read")
      ).resolves.toBe(true)

      const snapshot = await access.getSnapshot({
        actorUserId: administrator.user.id,
      })
      expect(snapshot.roles).toContainEqual(
        expect.objectContaining({
          key: "production-planner",
          permissionKeys: ["planning.plan.read", "planning.priority.write"],
        })
      )
      expect(snapshot.users).toContainEqual(
        expect.objectContaining({
          email: "planner@mrmpl.test",
          roleKeys: ["production-planner"],
          overrides: expect.arrayContaining([
            expect.objectContaining({
              effect: "deny",
              permissionKey: "planning.plan.read",
            }),
            expect.objectContaining({
              effect: "allow",
              permissionKey: "operations.dashboard.read",
            }),
          ]),
        })
      )

      const audit = await pool.query<{ event_type: string }>(
        `SELECT event_type
         FROM audit.events
         WHERE actor_user_id = $1
           AND event_type LIKE 'access.%'`,
        [administrator.user.id]
      )
      expect(audit.rows.map((row) => row.event_type)).toEqual(
        expect.arrayContaining([
          "access.role.created",
          "access.role.capability_granted",
          "access.role.assigned",
          "access.permission.override_set",
        ])
      )
    } finally {
      await authorization.close()
      await otherInstanceAccess.close()
      await access.close()
      await provisioner.close()
      await system.close()
    }
  })

  it("derives access from the linked employee's current approved post", async () => {
    const system = createAuthSystem({
      allowSignUp: true,
      baseURL: "http://localhost:3001",
      connectionString,
      secret: "test-only-better-auth-secret-000000000000",
    })
    const provisioner = createInitialAdministratorProvisioner({
      connectionString,
    })
    const access = createAccessAdministrationService({
      auth: system.auth,
      connectionString,
    })
    const authorization = createAuthorizationRepository({ connectionString })

    try {
      const administrator = await system.auth.api.signUpEmail({
        body: {
          email: "administrator@mrmpl.test",
          name: "System Administrator",
          password: "test-only-password",
        },
      })
      await provisioner.promote({
        email: administrator.user.email,
        userId: administrator.user.id,
      })
      const staff = await access.provisionStaff({
        actorUserId: administrator.user.id,
        email: "linked-planner@mrmpl.test",
        employeeCode,
        organizationId,
        password: "linked-planner-password",
      })
      await access.createRole({
        actorUserId: administrator.user.id,
        key: "post-production-planner",
        name: "Post production planner",
        permissionKeys: ["planning.plan.read"],
      })
      await access.setPostRole({
        actorUserId: administrator.user.id,
        enabled: true,
        postId,
        roleKey: "post-production-planner",
      })

      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(true)
      const snapshot = await access.getSnapshot({
        actorUserId: administrator.user.id,
      })
      expect(snapshot.users).toContainEqual(
        expect.objectContaining({
          id: staff.id,
          employee: expect.objectContaining({
            employeeCode,
            inheritedRoleKeys: ["post-production-planner"],
            postCodes: ["ACCESS-POST-001"],
          }),
        })
      )

      await pool.query(
        `UPDATE recruitment.posts
         SET status = 'Resigned', last_working_date = current_date - 1
         WHERE id = $1`,
        [postId]
      )
      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(false)

      await pool.query(
        `UPDATE recruitment.posts
         SET status = 'Occupied', last_working_date = NULL
         WHERE id = $1`,
        [postId]
      )
      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(true)

      await access.setPostRole({
        actorUserId: administrator.user.id,
        enabled: false,
        postId,
        roleKey: "post-production-planner",
      })
      await expect(
        authorization.hasCapability(staff.id, "planning.plan.read")
      ).resolves.toBe(false)

      const audit = await pool.query<{ event_type: string }>(
        `SELECT event_type
         FROM audit.events
         WHERE actor_user_id = $1
           AND event_type IN (
             'access.post_role.assigned',
             'access.post_role.removed'
           )
         ORDER BY event_type`,
        [administrator.user.id]
      )
      expect(audit.rows.map((row) => row.event_type)).toEqual([
        "access.post_role.assigned",
        "access.post_role.removed",
      ])
    } finally {
      await pool.query(
        `UPDATE recruitment.posts
         SET status = 'Occupied', last_working_date = NULL
         WHERE id = $1`,
        [postId]
      )
      await authorization.close()
      await access.close()
      await provisioner.close()
      await system.close()
    }
  })
})
