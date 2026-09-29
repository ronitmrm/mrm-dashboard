import "server-only"

import {
  createAuthorizationRepository,
  createRecruitmentRepository,
} from "@workspace/db"
import type { ProductionFloorCode } from "@workspace/db/production-floors"

import {
  productionMachinistOptions,
  sharedEmployeeMasterRows,
} from "../shared-employee-master"

export async function signedInMachinist({
  connectionString,
  organizationId,
  productionFloorCode,
  userId,
}: {
  connectionString: string
  organizationId: string
  productionFloorCode: ProductionFloorCode
  userId: string
}) {
  const authorization = createAuthorizationRepository({ connectionString })
  const recruitment = createRecruitmentRepository({ connectionString })
  try {
    const [employeeCode, posts] = await Promise.all([
      authorization.linkedEmployeeCode(userId, organizationId),
      recruitment.listPosts(organizationId),
    ])
    if (!employeeCode) return null
    return (
      productionMachinistOptions(
        sharedEmployeeMasterRows(posts),
        productionFloorCode
      ).find((employee) =>
        employee.code.localeCompare(employeeCode, "en-IN", {
          sensitivity: "accent",
        }) === 0
      ) ?? null
    )
  } finally {
    await Promise.all([authorization.close(), recruitment.close()])
  }
}
