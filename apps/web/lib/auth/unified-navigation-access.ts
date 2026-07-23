import { commercialNavigationAccess } from "./commercial-capabilities"
import { listGrantedCapabilities } from "./require-capability"

const operationsCapability = "operations.dashboard.read"
const administrationCapability = "administration.roles.manage"

export type UnifiedNavigationAccess = {
  administration: boolean
  commercialHrefs: string[]
  operations: boolean
}

export async function getUnifiedNavigationAccess(
  userId: string
): Promise<UnifiedNavigationAccess> {
  const capabilities = [
    operationsCapability,
    administrationCapability,
    ...commercialNavigationAccess.map(([, capability]) => capability),
  ]
  const grantedCapabilities = new Set(
    await listGrantedCapabilities(userId, [...new Set(capabilities)])
  )

  return {
    administration: grantedCapabilities.has(administrationCapability),
    commercialHrefs: commercialNavigationAccess
      .filter(([, capability]) => grantedCapabilities.has(capability))
      .map(([href]) => href),
    operations: grantedCapabilities.has(operationsCapability),
  }
}
