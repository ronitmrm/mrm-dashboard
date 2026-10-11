import "server-only"
import { redirect } from "next/navigation"
import {
  createInterestedPartiesRepository,
  type InterestedPartiesAccess,
} from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { interestedPartiesCapabilities } from "@/lib/auth/interested-parties-capabilities"
export async function withInterestedParties<T>(
  operation: (context: {
    repository: ReturnType<typeof createInterestedPartiesRepository>
    access: InterestedPartiesAccess
  }) => Promise<T>
) {
  const session = await requireAuthenticatedSession(
    "/iso-document/interested-parties"
  )
  const repository = createInterestedPartiesRepository({
    pool: getWebPostgresPool(),
  })
  try {
    const [organizationId, grants] = await Promise.all([
      repository.organizationId(),
      listGrantedCapabilities(
        session.user.id,
        Object.values(interestedPartiesCapabilities)
      ),
    ])
    if (!grants.length) redirect("/unauthorized")
    return await operation({
      repository,
      access: {
        organizationId,
        userId: session.user.id,
        userName: session.user.name,
        canReadAll: grants.includes(interestedPartiesCapabilities.readAll),
        canManage: grants.includes(interestedPartiesCapabilities.manage),
        canVerify: grants.includes(interestedPartiesCapabilities.verify),
      },
    })
  } finally {
    await repository.close()
  }
}
