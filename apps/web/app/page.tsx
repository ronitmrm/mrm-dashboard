import {
  defaultProductionFloorCode,
  normalizeProductionFloorCode,
} from "@workspace/db/production-floors"
import { createStoreRepository } from "@workspace/db"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import { productionModuleIsEnabled } from "@/lib/production-module"
import {
  dashboardNavigation,
  legacyMasterEntryForDashboardTab,
  type DashboardTabId,
} from "@/lib/unified-navigation"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    floor?: string | string[]
    entry?: string | string[]
    tab?: string | string[]
  }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")

  const { MrmplDashboard } = await import("@/components/mrmpl-dashboard")
  const query = await searchParams
  const session = await requireCapability("operations.dashboard.read", "/")
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)
  const capabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      "operations.corrections.write",
      "store.manage",
      "store.read",
    ])
  )
  const storeMasterData = capabilities.has("store.read")
    ? await (async () => {
        const repository = createStoreRepository({
          connectionString: readAuthEnvironment().connectionString,
        })
        try {
          const organizationId = await repository.organizationIdForCode("MRMPL")
          const [
            items,
            locations,
            suppliers,
            supplierPrices,
            vendors,
            masters,
          ] = await Promise.all([
            repository.listItemTypes(organizationId),
            repository.listLocations(organizationId),
            repository.listSuppliers(organizationId),
            repository.listSupplierPrices(organizationId),
            repository.listVendors(organizationId),
            repository.listAssetClassificationMasters(organizationId),
          ])
          return {
            items,
            locations,
            masters,
            supplierPrices,
            suppliers,
            vendors,
          }
        } finally {
          await repository.close()
        }
      })()
    : null
  const requestedTab = Array.isArray(query.tab) ? query.tab[0] : query.tab
  const legacyMasterEntry = legacyMasterEntryForDashboardTab(requestedTab)
  const initialDashboardTab = legacyMasterEntry
    ? "dataEntryTab"
    : dashboardNavigation.some(
          (item) => item.id === requestedTab
        )
      ? (requestedTab as DashboardTabId)
      : "productionControlTab"
  const requestedFloor = Array.isArray(query.floor)
    ? query.floor[0]
    : query.floor
  const requestedEntryFromQuery = Array.isArray(query.entry)
    ? query.entry[0]
    : query.entry
  const requestedEntry = requestedEntryFromQuery ?? legacyMasterEntry

  return (
    <MrmplDashboard
      initialDashboardTab={initialDashboardTab}
      initialDataEntryType={requestedEntry}
      initialProductionFloor={normalizeProductionFloorCode(
        requestedFloor ?? defaultProductionFloorCode
      )}
      navigationAccess={navigationAccess}
      canDeleteMasters={capabilities.has("operations.corrections.write")}
      canManageStoreMasters={capabilities.has("store.manage")}
      storeMasterData={storeMasterData}
      user={{ email: session.user.email, name: session.user.name }}
    />
  )
}
