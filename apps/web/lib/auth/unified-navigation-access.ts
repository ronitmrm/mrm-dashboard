import { cache } from "react"

import { commercialNavigationAccess } from "./commercial-capabilities"
import { storeNavigationAccess } from "./store-capabilities"
import { listGrantedCapabilities } from "./require-capability"
import { hrMasterNavigation, hrNavigation } from "../unified-navigation"
import { productionModuleIsEnabled } from "../production-module"
import { productionPageCapabilities } from "./production-capabilities"
import {
  isProductionFloorTab,
  productionFloorPageCapabilities,
} from "./production-floor-capabilities"
import type { DashboardTabId } from "../unified-navigation"
import type { ProductionFloorCode } from "@workspace/db/production-floors"

const operationsCapability = "operations.dashboard.read"
const administrationCapability = "administration.access.read"

export type UnifiedNavigationAccess = {
  administration: boolean
  commercialHrefs: string[]
  hrHrefs: string[]
  operations: boolean
  productionFloorTabIds?: Partial<Record<ProductionFloorCode, DashboardTabId[]>>
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
    ...Object.values(productionFloorPageCapabilities).flatMap(Object.values),
    ...storeNavigationAccess.map(([, capability]) => capability),
    ...[...hrMasterNavigation, ...hrNavigation].map(
      ({ requiredCapability }) => requiredCapability
    ),
    ...commercialNavigationAccess.map(([, capability]) => capability),
  ]
  const grantedCapabilities = new Set(
    await listGrantedCapabilities(userId, [...new Set(capabilities)])
  )
  const universalProductionTabIds = Object.entries(productionPageCapabilities)
    .filter(([tab]) => !isProductionFloorTab(tab as DashboardTabId))
    .filter(([, capability]) => grantedCapabilities.has(capability))
    .map(([tab]) => tab as DashboardTabId)
  const legacyFloorTabIds = Object.entries(productionPageCapabilities)
    .filter(
      ([tab, capability]) =>
        isProductionFloorTab(tab as DashboardTabId) &&
        grantedCapabilities.has(capability)
    )
    .map(([tab]) => tab as DashboardTabId)
  const hasFloorSpecificGrant = Object.values(
    productionFloorPageCapabilities
  ).some((capabilities) =>
    Object.values(capabilities).some((key) => grantedCapabilities.has(key))
  )
  const productionFloorTabIds = Object.fromEntries(
    Object.entries(productionFloorPageCapabilities).map(
      ([floor, floorCapabilities]) => {
        let tabs = Object.entries(floorCapabilities)
          .filter(([, capability]) => grantedCapabilities.has(capability))
          .map(([tab]) => tab as DashboardTabId)
        if (!hasFloorSpecificGrant) {
          tabs = legacyFloorTabIds
          if (!tabs.length && grantedCapabilities.has(operationsCapability)) {
            tabs = Object.keys(floorCapabilities) as DashboardTabId[]
          }
        }
        return [floor, tabs]
      }
    )
  ) as Partial<Record<ProductionFloorCode, DashboardTabId[]>>
  const productionTabIds = [
    ...new Set([
      ...universalProductionTabIds,
      ...Object.values(productionFloorTabIds).flatMap((tabs) => tabs ?? []),
    ]),
  ]
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
    productionFloorTabIds,
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
