import type { ProductionFloorCode } from "@workspace/db/production-floors"

import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"

export type OperationalEntryView = "dataEntry" | "masterTables"

export type ExternalOperationalEntryOption = {
  href: string
  id: string
  title: string
}

export function operationalDataDashboardHref(
  view: OperationalEntryView,
  productionFloorCode: ProductionFloorCode,
  entryType?: string | null
) {
  const params = new URLSearchParams({
    tab: view === "dataEntry" ? "operationalEntryTab" : "operationalTablesTab",
    floor: productionFloorCode,
  })
  const normalizedEntryType = entryType?.trim()
  if (normalizedEntryType) params.set("entry", normalizedEntryType)
  return `/?${params.toString()}`
}

export function externalOperationalEntryOptions(
  access: UnifiedNavigationAccess,
  view: OperationalEntryView
): ExternalOperationalEntryOption[] {
  const options: ExternalOperationalEntryOption[] = []

  if (access.commercialHrefs.includes("/commercial/enquiries")) {
    options.push({
      href: `/commercial/enquiries?operationalView=${view}`,
      id: "commercial_enquiries",
      title: "Enquiries",
    })
  }

  if (access.commercialHrefs.includes("/commercial/orders")) {
    options.push({
      href: `/commercial/orders?operationalView=${view}`,
      id: "commercial_purchase_orders",
      title: "Purchase Orders",
    })
  }

  return options
}
