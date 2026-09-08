import {
  defaultProductionFloorCode,
  normalizeProductionFloorCode,
} from "@workspace/db/production-floors"
import {
  createCommercialWorkflowRepository,
  createStoreRepository,
} from "@workspace/db"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
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
import {
  masterCapability,
  masterPermissionOptions,
} from "@/lib/auth/master-capabilities"
import { productionMasterCapability } from "@/lib/auth/production-master-access"
import { normalizeStoreMasterKey } from "@/lib/store-master-selection"
import { MasterAccessProvider } from "@/components/master-access-provider"
import { selectedStoreMasterData } from "@/lib/auth/store-master-access"

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
    storeMaster?: string | string[]
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
  const requestedFloorForMaster = normalizeProductionFloorCode(
    value(query.floor)
  )
  const selectedStoreMaster = normalizeStoreMasterKey(value(query.storeMaster))
  const masterEntry =
    value(query.entry) ?? legacyMasterEntryForDashboardTab(requestedTab)
  const isMasterPage =
    requestedTab === "dataEntryTab" ||
    requestedTab === "masterTablesTab" ||
    Boolean(legacyMasterEntryForDashboardTab(requestedTab))
  if (isMasterPage) {
    const readKey =
      masterEntry === "store_masters"
        ? masterCapability(selectedStoreMaster, "read")
        : productionMasterCapability(
            masterEntry ?? "",
            "read",
            requestedFloorForMaster
          )
    if (!readKey) redirect("/masters")
    await requireCapability(readKey, "/masters")
  }
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
      ...masterPermissionOptions.map(({ key }) => key),
    ])
  )
  if (isMasterPage && requestedTab !== "masterTablesTab") {
    const writeKeys =
      masterEntry === "store_masters"
        ? [
            masterCapability(selectedStoreMaster, "save"),
            masterCapability(selectedStoreMaster, "import"),
          ]
        : [
            productionMasterCapability(
              masterEntry ?? "",
              "save",
              requestedFloorForMaster
            ),
            productionMasterCapability(
              masterEntry ?? "",
              "import",
              requestedFloorForMaster
            ),
          ]
    if (!writeKeys.some((key) => key && capabilities.has(key))) {
      const params = new URLSearchParams(
        Object.entries(query).flatMap(([key, input]) =>
          input === undefined ? [] : [[key, value(input) ?? ""]]
        )
      )
      params.set("tab", "masterTablesTab")
      if (masterEntry) params.set("entry", masterEntry)
      redirect(`/?${params}`)
    }
  }
  const storeMasterData =
    isMasterPage &&
    masterEntry === "store_masters" &&
    capabilities.has(masterCapability(selectedStoreMaster, "read"))
      ? await (async () => {
          const connectionString = readAuthEnvironment().connectionString
          const repository = createStoreRepository({ connectionString })
          const workflow = createCommercialWorkflowRepository({
            connectionString,
          })
          try {
            const organizationId =
              await repository.organizationIdForCode("MRMPL")
            const [
              items,
              locations,
              suppliers,
              supplierPrices,
              vendors,
              masters,
              itemDrawings,
              portfolioProducts,
            ] = await Promise.all([
              repository.listItemTypes(organizationId),
              repository.listLocations(organizationId),
              repository.listSuppliers(organizationId),
              repository.listSupplierPrices(organizationId),
              repository.listVendors(organizationId),
              repository.listAssetClassificationMasters(organizationId),
              repository.listItemTypeDrawings(organizationId),
              workflow.listDesignPortfolioProducts("MRMPL"),
            ])
            return selectedStoreMasterData(
              {
                itemDrawings,
                items,
                locations,
                masters,
                portfolioProducts,
                supplierPrices,
                suppliers,
                vendors,
              },
              selectedStoreMaster,
              capabilities.has(masterCapability(selectedStoreMaster, "save"))
            )
          } finally {
            await Promise.all([repository.close(), workflow.close()])
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
  const initialDashboardTab = isMasterPage
    ? requestedDashboardTab
    : allowedDashboardTabs?.includes(requestedDashboardTab)
      ? requestedDashboardTab
      : (allowedDashboardTabs?.[0] ?? requestedDashboardTab)
  const pageCapability = productionCapabilityForTab(
    initialDashboardTab,
    requestedFloor
  )
  if (pageCapability && !isMasterPage) {
    await requireProductionPage(pageCapability, "/")
  }
  const requestedEntryFromQuery = Array.isArray(query.entry)
    ? query.entry[0]
    : query.entry
  const requestedEntry = requestedEntryFromQuery ?? legacyMasterEntry

  return (
    <MasterAccessProvider
      permissions={isMasterPage ? [...capabilities] : null}
      stateUrl={
        isMasterPage
          ? `/api/masters/state?${new URLSearchParams({ entry: masterEntry ?? "", floor: requestedFloorForMaster, storeMaster: selectedStoreMaster })}`
          : undefined
      }
    >
      <MrmplDashboard
        initialDashboardTab={initialDashboardTab}
        initialDataEntryType={requestedEntry}
        initialProductionFloor={requestedFloor}
        navigationAccess={navigationAccess}
        canDeleteMasters={
          isMasterPage &&
          Boolean(
            productionMasterCapability(
              masterEntry ?? "",
              "delete",
              requestedFloorForMaster
            ) &&
            capabilities.has(
              productionMasterCapability(
                masterEntry ?? "",
                "delete",
                requestedFloorForMaster
              )!
            )
          )
        }
        canManageStoreMasters={capabilities.has(
          masterCapability(selectedStoreMaster, "save")
        )}
        storeMasterData={storeMasterData}
        user={{ email: session.user.email, name: session.user.name }}
      />
    </MasterAccessProvider>
  )
}
