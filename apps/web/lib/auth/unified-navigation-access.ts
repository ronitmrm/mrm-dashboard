import { cache } from "react"

import { commercialNavigationAccess } from "./commercial-capabilities"
import { storeNavigationAccess } from "./store-capabilities"
import { listGrantedCapabilities } from "./require-capability"
import { hrMasterNavigation, hrNavigation } from "../unified-navigation"
import { productionModuleIsEnabled } from "../production-module"
import { productionPageCapabilities } from "./production-capabilities"
import type { DashboardTabId } from "../unified-navigation"

const operationsCapability = "operations.dashboard.read"
const administrationCapability = "administration.access.read"

export type UnifiedNavigationAccess = {
  administration: boolean
  commercialHrefs: string[]
  hrHrefs: string[]
  operations: boolean
  productionTabIds?: DashboardTabId[]
  store: boolean
  storeHrefs?: string[]
}

async function readUnifiedNavigationAccess(
  userId: string
): Promise<UnifiedNavigationAccess> {
  const capabilities = [
    operationsCapability,
    "hr.recruitment.read",
    administrationCapability,
    ...Object.values(productionPageCapabilities),
    ...storeNavigationAccess.map(([, capability]) => capability),
    ...[...hrMasterNavigation, ...hrNavigation].map(
      ({ requiredCapability }) => requiredCapability
    ),
    ...commercialNavigationAccess.map(([, capability]) => capability),
  ]
  const grantedCapabilities = new Set(
    await listGrantedCapabilities(userId, [...new Set(capabilities)])
  )
  const productionTabIds = Object.entries(productionPageCapabilities)
    .filter(([, capability]) => grantedCapabilities.has(capability))
    .map(([tab]) => tab as DashboardTabId)
  if (
    productionTabIds.length === 0 &&
    grantedCapabilities.has(operationsCapability)
  ) {
    productionTabIds.push(
      ...(Object.keys(productionPageCapabilities) as DashboardTabId[])
    )
  }
  const hasGranularHrAccess = [...hrMasterNavigation, ...hrNavigation].some(
    ({ requiredCapability }) => grantedCapabilities.has(requiredCapability)
  )

  return {
    administration: grantedCapabilities.has(administrationCapability),
    commercialHrefs: commercialNavigationAccess
      .filter(([, capability]) => grantedCapabilities.has(capability))
      .map(([href]) => href),
    hrHrefs: [...hrMasterNavigation, ...hrNavigation]
      .filter(
        ({ requiredCapability }) =>
          grantedCapabilities.has(requiredCapability) ||
          (!hasGranularHrAccess &&
            requiredCapability !== "hr.employees.read" &&
            grantedCapabilities.has("hr.recruitment.read"))
      )
      .map(({ href }) => href),
    operations: productionModuleIsEnabled() && productionTabIds.length > 0,
    productionTabIds,
    store: storeNavigationAccess.some(([, capability]) =>
      grantedCapabilities.has(capability)
    ),
    storeHrefs: storeNavigationAccess
      .filter(([, capability]) => grantedCapabilities.has(capability))
      .map(([href]) => href),
  }
}

export const getUnifiedNavigationAccess = cache(readUnifiedNavigationAccess)
