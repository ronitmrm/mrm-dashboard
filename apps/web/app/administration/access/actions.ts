"use server"

import { revalidatePath } from "next/cache"

import { createAccessAdministrationService } from "@/lib/auth/access-administration"
import { getAuth, readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const accessPath = "/administration/access"

function requiredText(formData: FormData, name: string) {
  const value = formData.get(name)
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function optionalText(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

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

export async function provisionStaffAction(formData: FormData) {
  const password = requiredText(formData, "password")
  if (password.length < 12) {
    throw new Error("password must contain at least 12 characters")
  }

  const employee = employeeReference(formData)
  await withAccessService(
    "administration.users.manage",
    (access, actorUserId) =>
      access.provisionStaff({
        actorUserId,
        email: requiredText(formData, "email").toLowerCase(),
        ...employee,
        password,
      })
  )
  revalidatePath(accessPath)
}

export async function linkEmployeeAction(formData: FormData) {
  const employee = employeeReference(formData)
  await withAccessService(
    "administration.users.manage",
    (access, actorUserId) =>
      access.linkEmployee({
        actorUserId,
        ...employee,
        userId: requiredText(formData, "userId"),
      })
  )
  revalidatePath(accessPath)
}

export async function createRoleAction(formData: FormData) {
  const permissionKeys = formData
    .getAll("permissionKeys")
    .filter((value): value is string => typeof value === "string")

  await withAccessService(
    "administration.roles.manage",
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
}

export async function assignRoleAction(formData: FormData) {
  await withAccessService(
    "administration.roles.manage",
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
    "administration.roles.manage",
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
    "administration.roles.manage",
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
