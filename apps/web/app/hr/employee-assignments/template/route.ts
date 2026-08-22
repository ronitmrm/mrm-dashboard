import { createRecruitmentRepository } from "@workspace/db"

import { buildEmployeeAssignmentWorkbook } from "@/app/hr/employee-assignment-workbook"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireCapability("hr.employees.read", "/hr?panel=employeeMasterPanel")
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [combinedRoles, posts] = await Promise.all([
      repository.listCombinedRoles(organizationId),
      repository.listPosts(organizationId),
    ])
    return xlsxResponse(
      buildEmployeeAssignmentWorkbook({ combinedRoles, posts }),
      "employee-post-assignments.xlsx"
    )
  } finally {
    await repository.close()
  }
}
