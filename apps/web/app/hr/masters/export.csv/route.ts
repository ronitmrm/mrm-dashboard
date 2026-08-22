import { createRecruitmentRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCsvResponse } from "@/lib/master-data-csv"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind")
  const templates = kind === "job_template"
  await requireCapability(
    templates ? "hr.job_templates.read" : "hr.masters.read",
    "/hr"
  )
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    if (templates) {
      const rows = await repository.listTemplates(organizationId)
      return masterCsvResponse(
        rows.map((row) => ({
          "Template Code": row.templateCode,
          Name: row.name,
          "Department Code": row.departmentCode,
          "Combined Role Id": row.combinedRoleId,
          "Designation Code": row.designationCode,
          Gender: row.gender,
          Education: row.education,
          "Experience Requirement": row.experienceRequirement,
          "Minimum Salary": row.minimumSalary,
          "Maximum Salary": row.maximumSalary,
          "Role Responsibilities": row.roleResponsibilities,
        })),
        "job-template-master.csv"
      )
    }
    const masters = await repository.listMasters(organizationId)
    const rows =
      kind === "designation" ? masters.designations : masters.departments
    return masterCsvResponse(
      rows.map((row) => ({ Code: row.code, Name: row.name })),
      `${kind === "designation" ? "designation" : "department"}-master.csv`
    )
  } finally {
    await repository.close()
  }
}
