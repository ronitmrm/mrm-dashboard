import "server-only"
import { createCustomerSatisfactionRepository } from "@workspace/db"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { satisfactionCapabilities } from "@/lib/auth/customer-satisfaction-capabilities"
export async function withCustomerSatisfaction<T>(
  operation: (context: {
    repository: ReturnType<typeof createCustomerSatisfactionRepository>
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
    "/iso-document/customer-satisfaction"
  )
  const repository = createCustomerSatisfactionRepository({
    pool: getWebPostgresPool(),
  })
  try {
    const [organizationId, grants] = await Promise.all([
      repository.organizationId(),
      listGrantedCapabilities(
        session.user.id,
        Object.values(satisfactionCapabilities)
      ),
    ])
    return await operation({
      repository,
      access: {
        organizationId,
        userId: session.user.id,
        userName: session.user.name,
        canReadAll: grants.includes(satisfactionCapabilities.read),
        canManage: grants.includes(satisfactionCapabilities.manage),
        canVerify: grants.includes(satisfactionCapabilities.verify),
      },
    })
  } finally {
    await repository.close()
  }
}
