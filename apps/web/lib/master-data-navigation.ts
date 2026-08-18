import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"

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
      "/hr?panel=approvedPostPanel",
      "/hr?panel=jobsPanel",
      "/hr?panel=candidatesPanel",
    ].includes(href)
  )
}

export function masterDataFallbackLinks(
  access: UnifiedNavigationAccess
): MasterDataFallbackLink[] {
  if (access.operations) return []

  const baseDestination = canReadRecruitmentMasters(access)
    ? "/hr?panel=mastersPanel"
    : access.commercialHrefs.includes("/commercial/masters")
      ? "/commercial/masters"
      : ""
  if (!baseDestination) return []

  const separator = baseDestination.includes("?") ? "&" : "?"
  return [
    {
      destination: `${baseDestination}${separator}masterView=dataEntry`,
      id: "dataEntryTab",
      title: "Data Entry",
    },
    {
      destination: `${baseDestination}${separator}masterView=masterTables`,
      id: "masterTablesTab",
      title: "Master Tables",
    },
  ]
}

export function externalMasterDataOptions(
  access: UnifiedNavigationAccess,
  view: "dataEntry" | "masterTables"
): ExternalMasterDataOption[] {
  const options: ExternalMasterDataOption[] = []
  if (canReadRecruitmentMasters(access)) {
    options.push(
      {
        href: `/hr?panel=mastersPanel&masterView=${view}`,
        id: "hr_masters",
        title: "HR Departments & Designations",
      },
      {
        href: `/hr?panel=postMasterPanel&masterView=${view}`,
        id: "hr_job_templates",
        title: "HR Job Templates",
      }
    )
  }

  if (access.commercialHrefs.includes("/commercial/masters")) {
    options.push({
      href: `/commercial/masters?masterView=${view}`,
      id: "commercial_pricing_masters",
      title: "Commercial Pricing Masters",
    })
  }

  return options
}
