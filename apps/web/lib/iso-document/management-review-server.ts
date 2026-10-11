import "server-only"
import {
  createManagementReviewRepository,
  type ManagementReviewAccess,
} from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { managementReviewCapabilities } from "@/lib/auth/management-review-capabilities"

export async function withManagementReview<T>(
  operation: (context: {
    repository: ReturnType<typeof createManagementReviewRepository>
    access: ManagementReviewAccess
  }) => Promise<T>
) {
  const session = await requireAuthenticatedSession(
    "/iso-document/management-review"
  )
  const repository = createManagementReviewRepository({
    pool: getWebPostgresPool(),
  })
  try {
    const [organizationId, grants] = await Promise.all([
      repository.organizationId(),
      listGrantedCapabilities(
        session.user.id,
        Object.values(managementReviewCapabilities)
      ),
    ])
    return await operation({
      repository,
      access: {
        organizationId,
        userId: session.user.id,
        userName: session.user.name,
        canReadAll: grants.includes(managementReviewCapabilities.read),
        canManage: grants.includes(managementReviewCapabilities.manage),
        canApprove: grants.includes(managementReviewCapabilities.approve),
        canVerify: grants.includes(managementReviewCapabilities.verify),
      },
    })
  } finally {
    await repository.close()
  }
}
