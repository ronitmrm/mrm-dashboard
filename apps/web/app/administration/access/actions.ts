"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createAccessAdministrationService } from "@/lib/auth/access-administration"
import { getAuth, readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { administrationTaskCapabilities } from "@/lib/auth/task-capabilities"
import { optionalText, requiredText } from "@/lib/form-data"

const accessPath = "/administration/access"

function employeeReference(formData: FormData) {
  const value = requiredText(formData, "employee")
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("employee selection is invalid")
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("employeeCode" in parsed) ||
    typeof parsed.employeeCode !== "string" ||
    !("organizationId" in parsed) ||
    typeof parsed.organizationId !== "string"
  ) {
    throw new Error("employee selection is invalid")
  }
  return {
    employeeCode: parsed.employeeCode,
    organizationId: parsed.organizationId,
  }
}

async function withAccessService<T>(
  capability: string,
  operation: (
    access: ReturnType<typeof createAccessAdministrationService>,
    actorUserId: string
  ) => Promise<T>
) {
  const session = await requireCapability(capability, accessPath)
  const environment = readAuthEnvironment()
  const access = createAccessAdministrationService({
    auth: getAuth(),
    connectionString: environment.connectionString,
  })

  try {
    return await operation(access, session.user.id)
  } finally {
    await access.close()
  }
}

export type StaffActionState = { error?: string; success?: string }

function staffActionError(error: unknown): StaffActionState {
  const message = error instanceof Error ? error.message : ""
  const expected = [
    "Staff name is required",
    "Password must contain at least 6 characters",
    "Select at least one application role",
    "Select existing non-system application roles",
    "The selected staff account no longer exists",
    "The selected active employee does not exist",
    "The selected employee already has a login account",
    "The selected user or active employee does not exist",
    "name is required",
    "email is required",
    "password is required",
    "employee is required",
    "userId is required",
  ]
  if (expected.includes(message)) return { error: message }
  if (/user already exists|email already exists/i.test(message)) {
    return {
      error:
        "This email already has an account. Select it below to assign roles.",
    }
  }
  return { error: "Could not save. Check the details, refresh and try again." }
}

export async function provisionStaffAction(
  _previousState: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const result = await withAccessService(
    administrationTaskCapabilities.provisionStaff,
    async (access, actorUserId) => {
      try {
        const password = formData.get("password")
        if (typeof password !== "string" || password.length < 6) {
          throw new Error("Password must contain at least 6 characters")
        }
        const user = await access.provisionStaff({
          actorUserId,
          email: requiredText(formData, "email").toLowerCase(),
          name: requiredText(formData, "name"),
          password,
        })
        return { userId: user.id }
      } catch (error) {
        return staffActionError(error)
      }
    }
  )
  if (!("userId" in result)) return result
  revalidatePath(accessPath)
  redirect(
    `${accessPath}?section=staff&staff=${encodeURIComponent(result.userId)}&created=1#staff-role-assignment`
  )
}

export async function linkEmployeeAction(
  _previousState: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const result = await withAccessService(
    administrationTaskCapabilities.linkStaffAccount,
    async (access, actorUserId) => {
      try {
        await access.linkEmployee({
          actorUserId,
          ...employeeReference(formData),
          userId: requiredText(formData, "userId"),
        })
        return {
          success: "Employee linked. Current post roles now apply as well.",
        }
      } catch (error) {
        return staffActionError(error)
      }
    }
  )
  if (!result.error) revalidatePath(accessPath)
  return result
}

export async function assignStaffRolesAction(
  _previousState: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const result = await withAccessService(
    administrationTaskCapabilities.assignStaffRole,
    async (access, actorUserId) => {
      try {
        await access.assignRoles({
          actorUserId,
          userId: requiredText(formData, "userId"),
          roleKeys: formData
            .getAll("roleKeys")
            .filter((key): key is string => typeof key === "string"),
        })
        return {
          success:
            "Roles assigned. Existing direct and post roles are preserved.",
        }
      } catch (error) {
        return staffActionError(error)
      }
    }
  )
  if (!result.error) revalidatePath(accessPath)
  return result
}

export async function createRoleAction(formData: FormData) {
  const permissionKeys = formData
    .getAll("permissionKeys")
    .filter((value): value is string => typeof value === "string")

  await withAccessService(
    administrationTaskCapabilities.createRole,
    (access, actorUserId) =>
      access.createRole({
        actorUserId,
        description: optionalText(formData, "description"),
        key: requiredText(formData, "key"),
        name: requiredText(formData, "name"),
        permissionKeys,
      })
  )
  revalidatePath(accessPath)
  redirect(`${accessPath}?section=roles`)
}

export type DeleteRoleActionState = { error?: string }

export async function deleteRoleAction(
  _previousState: DeleteRoleActionState,
  formData: FormData
): Promise<DeleteRoleActionState> {
  const state = await withAccessService(
    administrationTaskCapabilities.deleteRole,
    async (access, actorUserId): Promise<DeleteRoleActionState> => {
      try {
        await access.deleteRole({
          actorUserId,
          confirmation: requiredText(formData, "confirmation"),
          roleId: requiredText(formData, "roleId"),
        })
        return {}
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        const expectedErrors = [
          "The selected role no longer exists",
          "System roles cannot be deleted",
          "Role key confirmation does not match",
        ]
        return {
          error: expectedErrors.includes(message)
            ? message
            : "Could not delete the role. Refresh and try again.",
        }
      }
    }
  )
  if (state.error) return state
  revalidatePath(accessPath)
  const section = formData.get("section") === "staff" ? "staff" : "roles"
  redirect(`${accessPath}?section=${section}`)
}

export async function updateRolePermissionsAction(formData: FormData) {
  const permissionKeys = formData
    .getAll("permissionKeys")
    .filter((value): value is string => typeof value === "string")

  await withAccessService(
    administrationTaskCapabilities.updateRolePermissions,
    (access, actorUserId) =>
      access.updateRolePermissions({
        actorUserId,
        permissionKeys,
        roleKey: requiredText(formData, "roleKey"),
      })
  )
  revalidatePath(accessPath)
}

export async function assignRoleAction(formData: FormData) {
  await withAccessService(
    administrationTaskCapabilities.assignStaffRole,
    (access, actorUserId) =>
      access.assignRole({
        actorUserId,
        roleKey: requiredText(formData, "roleKey"),
        userId: requiredText(formData, "userId"),
      })
  )
  revalidatePath(accessPath)
}

export async function setPostRoleAction(formData: FormData) {
  const effect = requiredText(formData, "effect")
  if (effect !== "assign" && effect !== "remove") {
    throw new Error("effect must be assign or remove")
  }
  await withAccessService(
    administrationTaskCapabilities.assignPostAccess,
    (access, actorUserId) =>
      access.setPostRole({
        actorUserId,
        enabled: effect === "assign",
        postId: requiredText(formData, "postId"),
        roleKey: requiredText(formData, "roleKey"),
      })
  )
  revalidatePath(accessPath)
}

export async function setPermissionOverrideAction(formData: FormData) {
  const effect = requiredText(formData, "effect")
  if (effect !== "allow" && effect !== "deny") {
    throw new Error("effect must be allow or deny")
  }

  await withAccessService(
    administrationTaskCapabilities.managePermissionOverrides,
    (access, actorUserId) =>
      access.setPermissionOverride({
        actorUserId,
        effect,
        permissionKey: requiredText(formData, "permissionKey"),
        reason: optionalText(formData, "reason"),
        userId: requiredText(formData, "userId"),
      })
  )
  revalidatePath(accessPath)
}
