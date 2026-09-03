import {
  createAccessAdministrationRepository,
  createAuthorizationRepository,
} from "@workspace/db"

import type { AuthSystem } from "./auth"
import { administrationTaskCapabilities } from "./task-capabilities"

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

const roleKeyPattern = /^[a-z][a-z0-9-]*$/

export function normalizeApplicationRoleKey(value: string) {
  const normalizedKey = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (!roleKeyPattern.test(normalizedKey)) {
    throw new Error(
      "Role keys must start with a letter and contain only lowercase letters, numbers, and hyphens"
    )
  }
  return normalizedKey
}

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

type UpdateRolePermissionsInput = {
  actorUserId: string
  permissionKeys: string[]
  roleKey: string
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
      await requireActorCapability(
        actorUserId,
        administrationTaskCapabilities.provisionStaff
      )

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
      await requireActorCapability(
        input.actorUserId,
        administrationTaskCapabilities.linkStaffAccount
      )
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
      await requireActorCapability(
        actorUserId,
        administrationTaskCapabilities.createRole
      )
      const normalizedKey = normalizeApplicationRoleKey(key)

      return access.createRole({
        actorUserId,
        description: description?.trim() || undefined,
        key: normalizedKey,
        name: name.trim(),
        permissionKeys: [...new Set(permissionKeys)].sort(),
      })
    },

    async deleteRole(input: {
      actorUserId: string
      confirmation: string
      roleId: string
    }) {
      await requireActorCapability(
        input.actorUserId,
        administrationTaskCapabilities.deleteRole
      )
      return access.deleteRole(input)
    },

    async assignRole({ actorUserId, roleKey, userId }: AssignRoleInput) {
      await requireActorCapability(
        actorUserId,
        administrationTaskCapabilities.assignStaffRole
      )
      return access.assignRole({ actorUserId, roleKey, userId })
    },

    async updateRolePermissions({
      actorUserId,
      permissionKeys,
      roleKey,
    }: UpdateRolePermissionsInput) {
      await requireActorCapability(
        actorUserId,
        administrationTaskCapabilities.updateRolePermissions
      )
      return access.updateRolePermissions({
        actorUserId,
        permissionKeys: [...new Set(permissionKeys)].sort(),
        roleKey,
      })
    },

    async setPostRole(input: SetPostRoleInput) {
      await requireActorCapability(
        input.actorUserId,
        administrationTaskCapabilities.assignPostAccess
      )
      return access.setPostRole(input)
    },

    async setPermissionOverride(input: SetPermissionOverrideInput) {
      await requireActorCapability(
        input.actorUserId,
        administrationTaskCapabilities.managePermissionOverrides
      )
      return access.setPermissionOverride(input)
    },

    async getSnapshot({ actorUserId }: { actorUserId: string }) {
      await requireActorCapability(
        actorUserId,
        administrationTaskCapabilities.accessPage
      )
      return access.getSnapshot()
    },
  }
}
