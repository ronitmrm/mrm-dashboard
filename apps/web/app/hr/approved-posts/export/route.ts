import { createRecruitmentRepository } from "@workspace/db"

import { buildApprovedPostsWorkbook } from "@/app/hr/approved-posts-workbook"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireCapability("hr.recruitment.read", "/hr?panel=approvedPostPanel")
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [combinedRoles, posts, templates] = await Promise.all([
      repository.listCombinedRoles(organizationId),
      repository.listPosts(organizationId),
      repository.listTemplates(organizationId),
    ])
    return xlsxResponse(
      buildApprovedPostsWorkbook({ combinedRoles, posts, templates }),
      "approved-posts-register.xlsx"
    )
  } finally {
    await repository.close()
  }
}
