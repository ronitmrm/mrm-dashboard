import { commercialNavigationAccess } from "./commercial-capabilities"
import { listGrantedCapabilities } from "./require-capability"
import { hrNavigation } from "../unified-navigation"
import { productionModuleIsEnabled } from "../production-module"

const operationsCapability = "operations.dashboard.read"
const administrationCapability = "administration.roles.manage"

export type UnifiedNavigationAccess = {
  administration: boolean
  commercialHrefs: string[]
  hrHrefs: string[]
  operations: boolean
  store: boolean
}

export async function getUnifiedNavigationAccess(
  userId: string
): Promise<UnifiedNavigationAccess> {
  const capabilities = [
    operationsCapability,
    administrationCapability,
    "store.read",
    ...hrNavigation.map(({ requiredCapability }) => requiredCapability),
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
    hrHrefs: hrNavigation
      .filter(({ requiredCapability }) =>
        grantedCapabilities.has(requiredCapability)
      )
      .map(({ href }) => href),
    operations:
      productionModuleIsEnabled() &&
      grantedCapabilities.has(operationsCapability),
    store: grantedCapabilities.has("store.read"),
  }
}
