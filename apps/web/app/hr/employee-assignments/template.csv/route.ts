import { createRecruitmentRepository } from "@workspace/db"

import {
  employeeAssignmentCsvColumns,
  employeeAssignmentCsvRows,
} from "@/app/hr/employee-assignment-csv"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCsvResponse } from "@/lib/master-data-csv"

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
    return masterCsvResponse(
      employeeAssignmentCsvRows({ combinedRoles, posts }),
      "employee-assignment-template.csv",
      employeeAssignmentCsvColumns
    )
  } finally {
    await repository.close()
  }
}
