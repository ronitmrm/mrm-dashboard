import "server-only"

import {
  createAuthorizationRepository,
  createRecruitmentRepository,
} from "@workspace/db"
import type { ProductionFloorCode } from "@workspace/db/production-floors"

import {
  maintenanceEmployeeOptions,
  productionDispatchApproverOptions,
  productionMachinistOptions,
  productionQualityOptions,
  productionShopFloorOptions,
  sharedEmployeeMasterRows,
} from "../shared-employee-master"

export type SignedInWorkRole =
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
