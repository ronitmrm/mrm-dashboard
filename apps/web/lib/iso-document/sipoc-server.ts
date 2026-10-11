import "server-only"
import { redirect } from "next/navigation"
import { createSipocRepository, type SipocAccess } from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { sipocCapabilities } from "@/lib/auth/sipoc-capabilities"
export async function withSipoc<T>(
  operation: (context: {
    repository: ReturnType<typeof createSipocRepository>
    access: SipocAccess
  }) => Promise<T>
) {
  const session = await requireAuthenticatedSession("/iso-document/sipoc"),
    repository = createSipocRepository({ pool: getWebPostgresPool() })
  try {
    const [organizationId, grants] = await Promise.all([
      repository.organizationId(),
      listGrantedCapabilities(
        session.user.id,
        Object.values(sipocCapabilities)
      ),
    ])
    if (!grants.length) redirect("/unauthorized")
    return await operation({
      repository,
      access: {
        organizationId,
        userId: session.user.id,
        userName: session.user.name,
        canRead: grants.includes(sipocCapabilities.read),
        canManage: grants.includes(sipocCapabilities.manage),
        canApprove: grants.includes(sipocCapabilities.approve),
      },
    })
  } finally {
    await repository.close()
  }
}
