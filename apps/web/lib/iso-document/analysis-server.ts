import "server-only"

import { createIsoAnalysisRepository } from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { isoAnalysisCapabilities } from "@/lib/auth/iso-analysis-capabilities"

export async function withIsoAnalysis<T>(
  operation: (context: {
    repository: ReturnType<typeof createIsoAnalysisRepository>
    access: {
      organizationId: string
      userId: string
      userName: string
      canReadAll: boolean
      canManage: boolean
      canVerify: boolean
    }
  }) => Promise<T>
) {
  const session = await requireAuthenticatedSession(
    "/iso-document/analysis/pest"
  )
  const repository = createIsoAnalysisRepository({ pool: getWebPostgresPool() })
  try {
    const [organizationId, grants] = await Promise.all([
      repository.organizationId(),
      listGrantedCapabilities(
        session.user.id,
        Object.values(isoAnalysisCapabilities)
      ),
    ])
    return await operation({
      repository,
      access: {
        organizationId,
        userId: session.user.id,
        userName: session.user.name,
        canReadAll: grants.includes(isoAnalysisCapabilities.read),
        canManage: grants.includes(isoAnalysisCapabilities.manage),
        canVerify: grants.includes(isoAnalysisCapabilities.verify),
      },
    })
  } finally {
    await repository.close()
  }
}
