import {
  createAccessAdministrationRepository,
  createAuthorizationRepository,
} from "@workspace/db"

import type { AuthSystem } from "./auth"

type CreateAccessAdministrationServiceOptions = {
  auth: AuthSystem["auth"]
  connectionString: string
}

type ProvisionStaffInput = {
  actorUserId: string
  email: string
  employeeCode: string
  organizationId: string
  password: string
}

const MANAGE_USERS_CAPABILITY = "administration.users.manage"
const MANAGE_ROLES_CAPABILITY = "administration.roles.manage"

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

type LinkEmployeeInput = {
  actorUserId: string
  employeeCode: string
  organizationId: string
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

export function createAccessAdministrationService({
  auth,
  connectionString,
}: CreateAccessAdministrationServiceOptions) {
  const authorization = createAuthorizationRepository({ connectionString })
  const access = createAccessAdministrationRepository({ connectionString })

  async function requireActorCapability(
    actorUserId: string,
    capability: string
  ) {
    if (!(await authorization.hasCapability(actorUserId, capability))) {
      throw new Error(`User does not have the ${capability} capability`)
    }
  }

  return {
    close: async () => {
      await Promise.all([authorization.close(), access.close()])
    },

    async provisionStaff({
      actorUserId,
      email,
      employeeCode,
      organizationId,
      password,
    }: ProvisionStaffInput) {
      await requireActorCapability(actorUserId, MANAGE_USERS_CAPABILITY)

      const employee = await access.employeeForAccount({
        employeeCode,
        organizationId,
      })

      const created = await auth.api.createUser({
        body: {
          email,
          name: employee.name,
          password,
          role: "user",
        },
      })

      try {
        await access.linkEmployeeUser({
          accountOrigin: "new",
          actorUserId,
          employeeCode: employee.employeeCode,
          organizationId: employee.organizationId,
          userId: created.user.id,
        })
      } catch (error) {
        await auth.api.removeUser({ body: { userId: created.user.id } })
        throw error
      }

      return created.user
    },

    async linkEmployee(input: LinkEmployeeInput) {
      await requireActorCapability(input.actorUserId, MANAGE_USERS_CAPABILITY)
      await access.employeeForAccount(input)
      return access.linkEmployeeUser({ ...input, accountOrigin: "existing" })
    },

    async createRole({
      actorUserId,
      description,
      key,
      name,
      permissionKeys,
    }: CreateRoleInput) {
      await requireActorCapability(actorUserId, MANAGE_ROLES_CAPABILITY)
      const normalizedKey = key.trim().toLowerCase()
      if (!/^[a-z][a-z0-9-]*$/.test(normalizedKey)) {
        throw new Error(
          "Role keys must start with a letter and contain only lowercase letters, numbers, and hyphens"
        )
      }

      return access.createRole({
        actorUserId,
        description: description?.trim() || undefined,
        key: normalizedKey,
        name: name.trim(),
        permissionKeys: [...new Set(permissionKeys)].sort(),
      })
    },

    async assignRole({ actorUserId, roleKey, userId }: AssignRoleInput) {
      await requireActorCapability(actorUserId, MANAGE_ROLES_CAPABILITY)
      return access.assignRole({ actorUserId, roleKey, userId })
    },

    async setPostRole(input: SetPostRoleInput) {
      await requireActorCapability(input.actorUserId, MANAGE_ROLES_CAPABILITY)
      return access.setPostRole(input)
    },

    async setPermissionOverride(input: SetPermissionOverrideInput) {
      await requireActorCapability(input.actorUserId, MANAGE_ROLES_CAPABILITY)
      return access.setPermissionOverride(input)
    },

    async getSnapshot({ actorUserId }: { actorUserId: string }) {
      await requireActorCapability(actorUserId, MANAGE_ROLES_CAPABILITY)
      return access.getSnapshot()
    },
  }
}
