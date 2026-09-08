import { createRecruitmentRepository } from "@workspace/db"

import { buildApprovedPostsWorkbook } from "@/app/hr/approved-posts-workbook"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await requireCapability("masters.universal.approved_posts.read", "/hr?panel=approvedPostPanel")
  const granted = await listGrantedCapabilities(session.user.id, ["masters.universal.combined_approved_posts.read"])
  const includeCombinedJobs = granted.includes("masters.universal.combined_approved_posts.read")
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [combinedRoles, posts, templates] = await Promise.all([
      includeCombinedJobs ? repository.listCombinedRoles(organizationId) : Promise.resolve([]),
      repository.listPosts(organizationId),
      repository.listTemplates(organizationId),
    ])
    return xlsxResponse(
      buildApprovedPostsWorkbook({ combinedRoles, posts, templates, includeCombinedJobs }),
      "approved-posts-register.xlsx"
    )
  } finally {
    await repository.close()
  }
}
