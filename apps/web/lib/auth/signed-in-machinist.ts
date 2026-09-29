import "server-only"

import {
  createAuthorizationRepository,
  createRecruitmentRepository,
} from "@workspace/db"
import type { ProductionFloorCode } from "@workspace/db/production-floors"

import {
  activeEmployeeForCode,
  maintenanceEmployeeOptions,
  productionDispatchApproverOptions,
  productionMachinistOptions,
  productionQualityOptions,
  productionShopFloorOptions,
  productionWorkerOptions,
  sharedEmployeeMasterRows,
} from "../shared-employee-master"

export type SignedInWorkRole =
  | "authorized_staff"
  | "dispatch"
  | "machinist"
  | "maintenance"
  | "quality"
  | "shop_floor"

type EmployeeIdentityInput = {
  connectionString: string
  organizationId: string
  productionFloorCode?: ProductionFloorCode
  userId: string
}

export async function signedInEmployee({
  connectionString,
  organizationId,
  productionFloorCode,
  role,
  userId,
}: EmployeeIdentityInput & { role: SignedInWorkRole }) {
  const authorization = createAuthorizationRepository({ connectionString })
  const recruitment = createRecruitmentRepository({ connectionString })
  try {
    const [employeeCode, posts] = await Promise.all([
      authorization.linkedEmployeeCode(userId, organizationId),
      recruitment.listPosts(organizationId),
    ])
    if (!employeeCode) return null
    const rows = sharedEmployeeMasterRows(posts)
    if (role === "authorized_staff") return activeEmployeeForCode(rows, employeeCode)
    const options = role === "maintenance"
      ? maintenanceEmployeeOptions(rows)
      : productionFloorCode
        ? role === "dispatch"
          ? productionDispatchApproverOptions(rows, productionFloorCode)
          : role === "quality"
            ? productionQualityOptions(rows, productionFloorCode)
            : role === "shop_floor"
              ? productionShopFloorOptions(rows, productionFloorCode)
              : productionMachinistOptions(rows, productionFloorCode)
        : []
    return (
      options.find((employee) =>
        employee.code.localeCompare(employeeCode, "en-IN", {
          sensitivity: "accent",
        }) === 0
      ) ?? null
    )
  } finally {
    await Promise.all([authorization.close(), recruitment.close()])
  }
}

export function signedInMachinist(input: EmployeeIdentityInput & {
  productionFloorCode: ProductionFloorCode
}) {
  return signedInEmployee({ ...input, role: "machinist" })
}

export async function signedInPerformer(input: EmployeeIdentityInput & {
  userName: string
}) {
  const employee = await signedInEmployee({ ...input, role: "authorized_staff" })
  if (employee) return employee
  const name = input.userName.trim()
  return name ? { code: "", name } : null
}

export async function activeProductionWorker({
  connectionString,
  employeeCode,
  organizationId,
  productionFloorCode,
}: {
  connectionString: string
  employeeCode: string
  organizationId: string
  productionFloorCode: ProductionFloorCode
}) {
  const recruitment = createRecruitmentRepository({ connectionString })
  try {
    const posts = await recruitment.listPosts(organizationId)
    return productionWorkerOptions(
      sharedEmployeeMasterRows(posts),
      productionFloorCode
    ).find((employee) => employee.code.toLowerCase() === employeeCode.toLowerCase()) ?? null
  } finally {
    await recruitment.close()
  }
}
