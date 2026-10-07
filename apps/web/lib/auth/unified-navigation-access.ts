import { cache } from "react"
import { brandingPageAccess } from "./branding-capabilities"
import { qualityControlPageAccess } from "./quality-control-capabilities"
import { departmentStoreCapability } from "./department-store-capabilities"
import { isoCalibrationPlanPageAccess } from "./iso-calibration-plan-capabilities"
import {
  hrMasterForPanel,
  masterCapability,
  masterPermissionOptions,
} from "./master-capabilities"
import { operationalEntryPermissionOptions } from "./operational-entry-capabilities"

import { commercialNavigationAccess } from "./commercial-capabilities"
import { storeNavigationAccess } from "./store-capabilities"
import { listGrantedCapabilities } from "./require-capability"
import { hrMasterNavigation, hrNavigation } from "../unified-navigation"
import { productionModuleIsEnabled } from "../production-module"
import { productionPageCapabilities } from "./production-capabilities"
import { maintenanceNavigationAccess } from "./maintenance-capabilities"
import {
  isProductionFloorTab,
  productionFloorPageCapabilities,
} from "./production-floor-capabilities"
import type { DashboardTabId } from "../unified-navigation"
import { productionFloors, type ProductionFloorCode } from "@workspace/db/production-floors"

const operationsCapability = "operations.dashboard.read"
const administrationCapability = "administration.access.read"
const artifactCapability = "artifacts.read"

export type UnifiedNavigationAccess = {
  qualityControlHrefs?: string[]
  isoCalibrationPlan?: boolean
  productionStoreFloorCodes?: ProductionFloorCode[]
  brandingHrefs?: string[]
  masterReadKeys?: string[]
  operationalEntryReadKeys?: string[]
  administration: boolean
  artifacts?: boolean
  commercialHrefs: string[]
  hrHrefs: string[]
  maintenanceHrefs?: string[]
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
    ...qualityControlPageAccess.map(({ readPermissionKey }) => readPermissionKey),
    isoCalibrationPlanPageAccess.readPermissionKey,
    ...brandingPageAccess.map(({ readPermissionKey }) => readPermissionKey),
    ...masterPermissionOptions
      .filter(({ key }) => key.endsWith(".read"))
      .map(({ key }) => key),
    ...operationalEntryPermissionOptions
      .filter(({ key }) => key.endsWith(".read"))
      .map(({ key }) => key),
    operationsCapability,
    "hr.recruitment.read",
    administrationCapability,
    artifactCapability,
    ...Object.values(productionPageCapabilities),
    ...Object.values(productionFloorPageCapabilities).flatMap(Object.values),
    ...productionFloors.map((floor) => departmentStoreCapability(floor.code, "read")),
    ...storeNavigationAccess.map(([, capability]) => capability),
    ...[...hrMasterNavigation, ...hrNavigation].map(
      ({ requiredCapability }) => requiredCapability
    ),
    ...commercialNavigationAccess.map(([, capability]) => capability),
    ...maintenanceNavigationAccess.map(([, capability]) => capability),
  ]
  const grantedCapabilities = new Set(
    await listGrantedCapabilities(userId, [...new Set(capabilities)])
  )
  const universalProductionTabIds = Object.entries(productionPageCapabilities)
    .filter(
      ([tab]) => tab !== "operationalEntryTab" && tab !== "operationalTablesTab"
    )
    .filter(([tab]) => !isProductionFloorTab(tab as DashboardTabId))
    .filter(([, capability]) => grantedCapabilities.has(capability))
    .map(([tab]) => tab as DashboardTabId)
  const productionFloorTabIds = Object.fromEntries(
    Object.entries(productionFloorPageCapabilities).map(
      ([floor, floorCapabilities]) => {
        const tabs = Object.entries(floorCapabilities)
          .filter(([, capability]) => grantedCapabilities.has(capability))
          .map(([tab]) => tab as DashboardTabId)
        return [floor, tabs]
      }
    )
  ) as Partial<Record<ProductionFloorCode, DashboardTabId[]>>
  const productionStoreFloorCodes = productionFloors
    .filter((floor) => grantedCapabilities.has(departmentStoreCapability(floor.code, "read")))
    .map((floor) => floor.code)
  const productionTabIds = [
    ...new Set([
      ...universalProductionTabIds,
      ...(operationalEntryPermissionOptions.some(
        ({ key }) => key.endsWith(".read") && grantedCapabilities.has(key)
      )
        ? (["operationalEntryTab", "operationalTablesTab"] as DashboardTabId[])
        : []),
      ...Object.values(productionFloorTabIds).flatMap((tabs) => tabs ?? []),
    ]),
  ]
  const hasGranularHrAccess = [...hrMasterNavigation, ...hrNavigation].some(
    ({ requiredCapability }) =>
      requiredCapability !== "hr.employees.read" &&
      grantedCapabilities.has(requiredCapability)
  )

  return {
    qualityControlHrefs: qualityControlPageAccess.filter(({ readPermissionKey }) => grantedCapabilities.has(readPermissionKey)).map(({ href }) => href),
    isoCalibrationPlan:
      grantedCapabilities.has(isoCalibrationPlanPageAccess.readPermissionKey) ||
      grantedCapabilities.has("store.stock.read") ||
      grantedCapabilities.has("quality.control.calibration.read"),
    productionStoreFloorCodes,
    brandingHrefs: brandingPageAccess
      .filter(({ readPermissionKey }) =>
        grantedCapabilities.has(readPermissionKey)
      )
      .map(({ href }) => href),
    masterReadKeys: [...grantedCapabilities].filter(
      (key) => key.startsWith("masters.") && key.endsWith(".read")
    ),
    operationalEntryReadKeys: [...grantedCapabilities].filter(
      (key) => key.startsWith("entries.") && key.endsWith(".read")
    ),
    administration: grantedCapabilities.has(administrationCapability),
    artifacts: grantedCapabilities.has(artifactCapability),
    commercialHrefs: commercialNavigationAccess
      .filter(([, capability]) => grantedCapabilities.has(capability))
      .map(([href]) => href),
    hrHrefs: [...hrMasterNavigation, ...hrNavigation]
      .filter(({ panelId, requiredCapability }) => {
        const master = hrMasterForPanel(panelId)
        if (master)
          return grantedCapabilities.has(masterCapability(master, "read"))
        return (
          grantedCapabilities.has(requiredCapability) ||
          (!hasGranularHrAccess &&
            requiredCapability !== "hr.employees.read" &&
            grantedCapabilities.has("hr.recruitment.read"))
        )
      })
      .map(({ href }) => href),
    maintenanceHrefs: [
      "/maintenance/requests",
      ...maintenanceNavigationAccess
        .filter(([, capability]) => grantedCapabilities.has(capability))
        .map(([href]) => href),
    ],
    operations: productionModuleIsEnabled() && (productionTabIds.length > 0 || productionStoreFloorCodes.length > 0),
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
