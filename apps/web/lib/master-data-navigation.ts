import type { ProductionFloorCode } from "@workspace/db/production-floors"

import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import { parseStoreMasterKey } from "./store-master-selection"

export type ExternalMasterDataOption = {
  href: string
  id: string
  title: string
}

export type MasterDataFallbackLink = {
  destination: string
  id: "dataEntryTab" | "masterTablesTab"
  title: "Data Entry" | "Master Tables"
}

export const companyWideMasterEntryTypes = [
  "rejection_type_master",
  "rejection_remark_master",
  "rejection_reason_master",
  "store_masters",
  "hr_masters",
  "hr_job_templates",
  "commercial_pricing_masters",
  "commercial_customers",
  "commercial_website_products",
] as const

export function isCompanyWideMasterEntryType(entryType: string) {
  return (companyWideMasterEntryTypes as readonly string[]).includes(entryType)
}

export function masterPayloadForScope(
  entryType: string,
  payload: Record<string, unknown>
) {
  if (!isCompanyWideMasterEntryType(entryType)) return payload
  const companyWidePayload = { ...payload }
  delete companyWidePayload.productionFloorCode
  return companyWidePayload
}

function canReadRecruitmentMasters(access: UnifiedNavigationAccess) {
  return access.hrHrefs.some((href) =>
    [
      "/hr?panel=mastersPanel",
      "/hr?panel=postMasterPanel",
      "/hr?panel=approvedPostPanel",
      "/hr?panel=combinedRolesPanel",
      "/hr?panel=candidatesPanel",
    ].includes(href)
  )
}

export function masterDataFallbackLinks(
  access: UnifiedNavigationAccess
): MasterDataFallbackLink[] {
  if (access.operations) return []

  const baseDestination = canReadRecruitmentMasters(access)
    ? access.hrHrefs.includes("/hr?panel=mastersPanel")
      ? "/hr?panel=mastersPanel"
      : "/hr?panel=postMasterPanel"
    : access.commercialHrefs.includes("/commercial/masters")
      ? "/commercial/masters"
      : access.commercialHrefs.includes("/commercial/customers")
        ? "/commercial/customers"
        : access.commercialHrefs.includes("/commercial/website-products")
          ? "/commercial/website-products"
          : ""
  if (!baseDestination) return []

  const links: MasterDataFallbackLink[] = [
    {
      destination: "/masters?view=masterTables",
      id: "masterTablesTab",
      title: "Master Tables",
    },
  ]
  return links
}

export function masterDataDashboardHref(
  view: "dataEntry" | "masterTables",
  productionFloorCode: ProductionFloorCode,
  entryType?: string | null,
  storeMaster?: string | null
) {
  const params = new URLSearchParams({
    tab: view === "dataEntry" ? "dataEntryTab" : "masterTablesTab",
    floor: productionFloorCode,
  })
  const normalizedEntryType = entryType?.trim()
  if (normalizedEntryType) params.set("entry", normalizedEntryType)
  const selectedStoreMaster = parseStoreMasterKey(storeMaster)
  if (normalizedEntryType === "store_masters" && selectedStoreMaster) {
    params.set("storeMaster", selectedStoreMaster)
  }
  return `/?${params.toString()}`
}

export function masterDataNavigationLinks(
  access: UnifiedNavigationAccess,
  _context: {
    entryType?: string
    pathname: string
    productionFloorCode: ProductionFloorCode
    searchParams: Pick<URLSearchParams, "get">
  }
): MasterDataFallbackLink[] {
  void _context
  if (!access.operations) return masterDataFallbackLinks(access)

  const links: MasterDataFallbackLink[] = [
    {
      destination: "/masters?view=masterTables",
      id: "masterTablesTab",
      title: "Master Tables",
    },
  ]
  return links.filter(
    (item) =>
      !access.productionTabIds || access.productionTabIds.includes(item.id)
  )
}

export function externalMasterDataOptions(
  access: UnifiedNavigationAccess,
  view: "dataEntry" | "masterTables"
): ExternalMasterDataOption[] {
  const options: ExternalMasterDataOption[] = []
  if (access.hrHrefs.includes("/hr?panel=mastersPanel")) {
    options.push({
      href: `/hr?panel=mastersPanel&masterView=${view}`,
      id: "hr_masters",
      title: "HR Departments & Designations",
    })
  }
  if (access.hrHrefs.includes("/hr?panel=postMasterPanel")) {
    options.push({
      href: `/hr?panel=postMasterPanel&masterView=${view}`,
      id: "hr_job_templates",
      title: "HR Job Templates",
    })
  }

  if (access.commercialHrefs.includes("/commercial/masters")) {
    options.push({
      href: `/commercial/masters?masterView=${view}`,
      id: "commercial_pricing_masters",
      title: "Commercial Pricing Masters",
    })
  }

  if (access.commercialHrefs.includes("/commercial/customers")) {
    options.push({
      href: `/commercial/customers?masterView=${view}`,
      id: "commercial_customers",
      title: "Customers",
    })
  }

  if (access.commercialHrefs.includes("/commercial/website-products")) {
    options.push({
      href: `/commercial/website-products?masterView=${view}`,
      id: "commercial_website_products",
      title: "Website Products",
    })
  }

  return options
}
