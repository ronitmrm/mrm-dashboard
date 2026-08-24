import {
  defaultProductionFloorCode,
  normalizeProductionFloorCode,
} from "@workspace/db/production-floors"
import { createStoreRepository } from "@workspace/db"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import { productionModuleIsEnabled } from "@/lib/production-module"
import {
  operationalEntryModuleAccess,
  operationalEntrySelectionHref,
  operationalEntrySelectionMatchesDestination,
  resolveOperationalEntrySelection,
  type OperationalEntryView,
} from "@/lib/operational-entry-module"
import {
  dashboardNavigation,
  legacyMasterEntryForDashboardTab,
  type DashboardTabId,
} from "@/lib/unified-navigation"
import { productionCapabilityForTab } from "@/lib/auth/production-capabilities"
import { isProductionFloorTab } from "@/lib/auth/production-floor-capabilities"
import { requireProductionPage } from "@/lib/auth/require-production-page"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    floor?: string | string[]
    entry?: string | string[]
    operationalMain?: string | string[]
    operationalSub?: string | string[]
    operationalUnit?: string | string[]
    tab?: string | string[]
  }>
}) {
  if (!productionModuleIsEnabled()) redirect("/commercial")

  const { MrmplDashboard } = await import("@/components/mrmpl-dashboard")
  const query = await searchParams
  const session = await requireAuthenticatedSession("/")
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)
  const value = (input: string | string[] | undefined) =>
    Array.isArray(input) ? input[0] : input
  const requestedTab = value(query.tab)
  if (
    requestedTab === "operationalEntryTab" ||
    requestedTab === "operationalTablesTab"
  ) {
    const view: OperationalEntryView =
      requestedTab === "operationalTablesTab" ? "masterTables" : "dataEntry"
    const access = operationalEntryModuleAccess(navigationAccess)
    const selection = resolveOperationalEntrySelection(
      {
        main: value(query.operationalMain),
        sub: value(query.operationalSub),
        unit: value(query.operationalUnit),
      },
      access,
      view
    )
    if (
      !selection ||
      !operationalEntrySelectionMatchesDestination(selection, "/", {
        entry: value(query.entry),
        floor: value(query.floor),
        tab: requestedTab,
      })
    ) {
      const legacySelection = resolveOperationalEntrySelection(
        {
          main: "production_entries",
          sub: value(query.entry),
          unit: value(query.floor),
        },
        access,
        view
      )
      const selectionHref = operationalEntrySelectionHref(
        selection ?? legacySelection,
        view
      )
      redirect(selectionHref)
    }
  }
  const capabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      "operations.corrections.write",
      "store.masters.read",
      "store.masters.write",
    ])
  )
  const storeMasterData = capabilities.has("store.masters.read")
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
            itemDrawings,
          ] = await Promise.all([
            repository.listItemTypes(organizationId),
            repository.listLocations(organizationId),
            repository.listSuppliers(organizationId),
            repository.listSupplierPrices(organizationId),
            repository.listVendors(organizationId),
            repository.listAssetClassificationMasters(organizationId),
            repository.listItemTypeDrawings(organizationId),
          ])
          return {
            itemDrawings,
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
  const legacyMasterEntry = legacyMasterEntryForDashboardTab(requestedTab)
  const requestedFloor = normalizeProductionFloorCode(
    value(query.floor) ?? defaultProductionFloorCode
  )
  const requestedDashboardTab = legacyMasterEntry
    ? "dataEntryTab"
    : dashboardNavigation.some((item) => item.id === requestedTab)
      ? (requestedTab as DashboardTabId)
      : "productionControlTab"
  const requestedFloorTabs =
    navigationAccess.productionFloorTabIds?.[requestedFloor]
  const allowedDashboardTabs = isProductionFloorTab(requestedDashboardTab)
    ? requestedFloorTabs
    : navigationAccess.productionTabIds
  const initialDashboardTab = allowedDashboardTabs?.includes(
    requestedDashboardTab
  )
    ? requestedDashboardTab
    : (allowedDashboardTabs?.[0] ?? requestedDashboardTab)
  const pageCapability = productionCapabilityForTab(
    initialDashboardTab,
    requestedFloor
  )
  if (pageCapability) {
    await requireProductionPage(pageCapability, "/")
  }
  const requestedEntryFromQuery = Array.isArray(query.entry)
    ? query.entry[0]
    : query.entry
  const requestedEntry = requestedEntryFromQuery ?? legacyMasterEntry

  return (
    <MrmplDashboard
      initialDashboardTab={initialDashboardTab}
      initialDataEntryType={requestedEntry}
      initialProductionFloor={requestedFloor}
      navigationAccess={navigationAccess}
      canDeleteMasters={capabilities.has("operations.corrections.write")}
      canManageStoreMasters={capabilities.has("store.masters.write")}
      storeMasterData={storeMasterData}
      user={{ email: session.user.email, name: session.user.name }}
    />
  )
}
