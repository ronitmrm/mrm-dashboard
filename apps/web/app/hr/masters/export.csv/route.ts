import { createRecruitmentRepository } from "@workspace/db"
import { roleProfileFields } from "@workspace/db/recruitment-role-profile"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { masterCsvResponse } from "@/lib/master-data-csv"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind")
  const templates = kind === "job_template" || kind === "role_questions"
  await requireCapability(
    masterCapability(templates ? "job_templates" : kind === "designation" ? "designation" : "department", "read"),
    "/hr"
  )
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    if (templates) {
      const rows = await repository.listTemplates(organizationId)
      if (kind === "role_questions")
        return masterCsvResponse(
          rows.flatMap((row) =>
            row.interviewQuestions.map((question) => ({
              "Template Code": row.templateCode,
              Role: row.name,
              Round: question.round,
              Focus: question.focus,
              Question: question.prompt,
              "Evidence to seek": question.evidence,
              "Original Question": question.originalPrompt ?? "",
            }))
          ),
          "hr-role-questions.csv"
        )
      return masterCsvResponse(
        rows.map((row) => ({
          "Template Code": row.templateCode,
          Name: row.name,
          "Combined Role Id": row.combinedRoleId,
          "Designation Code": row.designationCode,
          Gender: row.gender,
          Education: row.education,
          "Experience Requirement": row.experienceRequirement,
          "Minimum Salary": row.minimumSalary,
          "Maximum Salary": row.maximumSalary,
          "Role Responsibilities": row.roleResponsibilities,
          ...Object.fromEntries(
            roleProfileFields.map(({ key }) => [
              `role_${key}`,
              row.roleProfile[key] ?? "",
            ])
          ),
          "Shift Type": row.shiftType,
          "Shift Start Time": row.shiftStartTime,
          "Shift End Time": row.shiftEndTime,
        })),
        "roles-responsibilities-authority.csv"
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
