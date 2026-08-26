import {
  defaultProductionFloorCode,
  parseProductionFloorCode,
  productionFloors,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"

import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import {
  commercialMasterKinds,
  commercialMasterWorkspaceKind,
} from "./commercial-master-workspace"
import { storeMasterOptions } from "./store-master-selection"

export const universalMasterUnit = "universal" as const
export type MasterUnit = ProductionFloorCode | typeof universalMasterUnit
export type MasterModuleView = "dataEntry" | "masterTables"

export type MasterModuleAccess = {
  commercialCustomers: boolean
  commercialPricing: boolean
  commercialWebsiteProducts: boolean
  hrApprovedPosts: boolean
  hrCandidates: boolean
  hrEmployees: boolean
  hrJobTemplates: boolean
  hrMasters: boolean
  operations: boolean
  storeMasters: boolean
}

export type MasterOption = { id: string; label: string }

type MasterAccessRule =
  | keyof MasterModuleAccess
  | readonly (keyof MasterModuleAccess)[]

type SubMasterDefinition = MasterOption & { access?: MasterAccessRule }

type MasterDefinition = MasterOption & {
  access: MasterAccessRule
  scope: "unit" | "universal"
  subMasters?: readonly SubMasterDefinition[]
}

const unitMasterDefinitions = [
  {
    id: "setup_name_master",
    label: "Setup Name",
    access: "operations",
    scope: "unit",
  },
  { id: "route", label: "Process Route", access: "operations", scope: "unit" },
  { id: "cycle", label: "Cycle Time", access: "operations", scope: "unit" },
  { id: "tooling", label: "Tooling", access: "operations", scope: "unit" },
  {
    id: "machine_master",
    label: "Machine",
    access: "operations",
    scope: "unit",
  },
  {
    id: "setup_checklist_master",
    label: "Setup Checklist",
    access: "operations",
    scope: "unit",
  },
  {
    id: "maintenance_checklist_master",
    label: "Maintenance Checklist",
    access: "operations",
    scope: "unit",
  },
  {
    id: "maintenance_master",
    label: "Maintenance Master",
    access: "operations",
    scope: "unit",
  },
  {
    id: "quality_parameter_master",
    label: "Quality Inspection Parameter",
    access: "operations",
    scope: "unit",
  },
  {
    id: "planning_holiday",
    label: "Planning Holiday",
    access: "operations",
    scope: "unit",
  },
] as const satisfies readonly MasterDefinition[]

const commercialSubMasters = commercialMasterKinds.map((selection) => ({
  id: commercialMasterWorkspaceKind(selection),
  label: selection.label,
}))

const websiteProductSubMasters = [
  {
    id: "commercial_website_products",
    label: "Website Product Data",
  },
  {
    access: "commercialPricing",
    id: "materialGrade",
    label: "Material Grade",
  },
  {
    access: "commercialPricing",
    id: "category",
    label: "Design Category",
  },
  {
    access: "commercialPricing",
    id: "subcategory",
    label: "Design Subcategory",
  },
  {
    access: "commercialPricing",
    id: "application",
    label: "Website Application",
  },
  {
    access: "commercialPricing",
    id: "certification",
    label: "Website Certification",
  },
  {
    access: "commercialPricing",
    id: "websiteField",
    label: "Website Field Option",
  },
] as const satisfies readonly SubMasterDefinition[]

const universalMasterDefinitions = [
  {
    id: "rejection",
    label: "Rejection",
    access: "operations",
    scope: "universal",
    subMasters: [
      { id: "rejection_type_master", label: "Rejection Type" },
      { id: "rejection_remark_master", label: "Rejection Remark" },
      { id: "rejection_reason_master", label: "Rejection Reason" },
    ],
  },
  {
    id: "store_masters",
    label: "Store Masters",
    access: "storeMasters",
    scope: "universal",
    subMasters: storeMasterOptions.map(([id, label]) => ({ id, label })),
  },
  {
    id: "hr_masters",
    label: "HR",
    access: [
      "hrMasters",
      "hrApprovedPosts",
      "hrCandidates",
      "hrEmployees",
      "hrJobTemplates",
    ],
    scope: "universal",
    subMasters: [
      { access: "hrMasters", id: "department", label: "Department" },
      { access: "hrMasters", id: "designation", label: "Designation" },
      {
        access: "hrApprovedPosts",
        id: "approved_posts",
        label: "Approved Posts",
      },
      {
        access: "hrApprovedPosts",
        id: "combined_approved_posts",
        label: "Combined Approved Posts",
      },
      {
        access: "hrCandidates",
        id: "candidates",
        label: "Candidates",
      },
      {
        access: "hrEmployees",
        id: "employee_assignments",
        label: "Employee Master",
      },
      {
        access: "hrJobTemplates",
        id: "job_templates",
        label: "HR Job Templates",
      },
    ],
  },
  {
    id: "commercial_pricing_masters",
    label: "Commercial Pricing Masters",
    access: "commercialPricing",
    scope: "universal",
    subMasters: commercialSubMasters,
  },
  {
    id: "commercial_customers",
    label: "Customers",
    access: "commercialCustomers",
    scope: "universal",
  },
  {
    id: "commercial_website_products",
    label: "Website Products",
    access: "commercialWebsiteProducts",
    scope: "universal",
    subMasters: websiteProductSubMasters,
  },
] as const satisfies readonly MasterDefinition[]

const masterDefinitions: readonly MasterDefinition[] = [
  ...unitMasterDefinitions,
  ...universalMasterDefinitions,
]

export type MasterSelection = {
  main: string
  sub: string
  unit: MasterUnit
}

export function masterModuleAccess(
  navigationAccess: UnifiedNavigationAccess,
  directAccess: { storeMasters?: boolean } = {}
): MasterModuleAccess {
  return {
    commercialCustomers: navigationAccess.commercialHrefs.includes(
      "/commercial/customers"
    ),
    commercialPricing: navigationAccess.commercialHrefs.includes(
      "/commercial/masters"
    ),
    commercialWebsiteProducts: navigationAccess.commercialHrefs.includes(
      "/commercial/website-products"
    ),
    hrApprovedPosts: navigationAccess.hrHrefs.includes(
      "/hr?panel=approvedPostPanel"
    ),
    hrCandidates: navigationAccess.hrHrefs.includes(
      "/hr?panel=candidatesPanel"
    ),
    hrEmployees: navigationAccess.hrHrefs.includes(
      "/hr?panel=employeeMasterPanel"
    ),
    hrJobTemplates: navigationAccess.hrHrefs.includes(
      "/hr?panel=postMasterPanel"
    ),
    hrMasters: navigationAccess.hrHrefs.includes("/hr?panel=mastersPanel"),
    operations:
      navigationAccess.productionTabIds?.includes("dataEntryTab") ?? false,
    storeMasters:
      (navigationAccess.productionTabIds?.includes("dataEntryTab") ?? false) &&
      Boolean(directAccess.storeMasters),
  }
}

function hasMasterAccess(rule: MasterAccessRule, access: MasterModuleAccess) {
  return typeof rule === "string"
    ? access[rule]
    : rule.some((key) => access[key])
}
export const masterUnitOptions: readonly MasterOption[] = [
  { id: universalMasterUnit, label: "Universal" },
  ...productionFloors.map(({ code, shortLabel }) => ({
    id: code,
    label: shortLabel,
  })),
]

export function availableMasterUnits(access: MasterModuleAccess) {
  return masterUnitOptions.filter(
    ({ id }) => availableMainMasters(id as MasterUnit, access).length > 0
  )
}

export function parseMasterUnit(value: unknown): MasterUnit | null {
  return value === universalMasterUnit
    ? universalMasterUnit
    : parseProductionFloorCode(value)
}

export function availableMainMasters(
  unit: MasterUnit,
  access: MasterModuleAccess
): MasterOption[] {
  const scope = unit === universalMasterUnit ? "universal" : "unit"
  return masterDefinitions
    .filter(
      (definition) =>
        definition.scope === scope && hasMasterAccess(definition.access, access)
    )
    .map(({ id, label }) => ({ id, label }))
}

export function subMastersFor(
  main: string,
  access: MasterModuleAccess
): { fallback: boolean; options: MasterOption[] } | null {
  const definition = masterDefinitions.find(
    (candidate) =>
      candidate.id === main && hasMasterAccess(candidate.access, access)
  )
  if (!definition) return null
  const options =
    definition.subMasters
      ?.filter(
        (option) => !option.access || hasMasterAccess(option.access, access)
      )
      .map(({ id, label }) => ({ id, label })) ?? []
  return options.length
    ? { fallback: false, options }
    : {
        fallback: true,
        options: [{ id: definition.id, label: definition.label }],
      }
}

export function autoSelectedSubMaster(
  main: string,
  access: MasterModuleAccess
) {
  const result = subMastersFor(main, access)
  return result?.fallback ? (result.options[0]?.id ?? "") : ""
}

export function resolveMasterSelection(
  input: { main?: unknown; sub?: unknown; unit?: unknown },
  access: MasterModuleAccess
): MasterSelection | null {
  const unit = parseMasterUnit(input.unit)
  const main = typeof input.main === "string" ? input.main : ""
  const sub = typeof input.sub === "string" ? input.sub : ""
  if (
    !unit ||
    !availableMainMasters(unit, access).some(({ id }) => id === main)
  ) {
    return null
  }
  const subMasters = subMastersFor(main, access)
  if (!subMasters?.options.some(({ id }) => id === sub)) return null
  return { main, sub, unit }
}

function addContext(params: URLSearchParams, selection: MasterSelection) {
  params.set("masterUnit", selection.unit)
  params.set("masterMain", selection.main)
  params.set("masterSub", selection.sub)
}

export function masterFormHref(
  selection: MasterSelection,
  view: MasterModuleView = "dataEntry"
) {
  const params = new URLSearchParams()
  if (
    unitMasterDefinitions.some(({ id }) => id === selection.main) ||
    selection.main === "rejection"
  ) {
    params.set("tab", view === "dataEntry" ? "dataEntryTab" : "masterTablesTab")
    params.set(
      "floor",
      selection.unit === universalMasterUnit
        ? defaultProductionFloorCode
        : selection.unit
    )
    params.set(
      "entry",
      selection.main === "rejection" ? selection.sub : selection.main
    )
    addContext(params, selection)
    return `/?${params.toString()}`
  }

  if (selection.main === "store_masters") {
    params.set("tab", view === "dataEntry" ? "dataEntryTab" : "masterTablesTab")
    params.set("floor", defaultProductionFloorCode)
    params.set("entry", selection.main)
    params.set("storeMaster", selection.sub)
    addContext(params, selection)
    return `/?${params.toString()}`
  }

  if (selection.main === "hr_masters") {
    const panel =
      selection.sub === "approved_posts"
        ? "approvedPostPanel"
        : selection.sub === "combined_approved_posts"
          ? "combinedRolesPanel"
          : selection.sub === "candidates"
            ? "candidatesPanel"
            : selection.sub === "employee_assignments"
              ? "employeeMasterPanel"
              : selection.sub === "job_templates"
                ? "postMasterPanel"
                : "mastersPanel"
    params.set("panel", panel)
    params.set("masterView", view)
    if (panel === "mastersPanel") params.set("kind", selection.sub)
    if (panel === "employeeMasterPanel") {
      params.set("kind", "employee-assignment")
    }
  } else if (selection.main === "commercial_pricing_masters") {
    params.set("masterView", view)
    params.set("kind", selection.sub)
  } else if (
    selection.main === "commercial_website_products" &&
    selection.sub !== selection.main
  ) {
    params.set("masterView", view)
    params.set("kind", selection.sub)
  } else {
    params.set("masterView", view)
  }
  addContext(params, selection)

  const path =
    selection.main === "hr_masters"
      ? "/hr"
      : selection.main === "commercial_pricing_masters"
        ? "/commercial/masters"
        : selection.main === "commercial_website_products" &&
            selection.sub !== selection.main
          ? "/commercial/masters"
          : selection.main === "commercial_customers"
            ? "/commercial/customers"
            : "/commercial/website-products"
  return `${path}?${params.toString()}`
}

export function masterOpenHref(
  selection: MasterSelection,
  view: MasterModuleView = "dataEntry"
) {
  const params = new URLSearchParams({
    unit: selection.unit,
    main: selection.main,
    sub: selection.sub,
  })
  if (view === "masterTables") params.set("view", view)
  return `/masters/open?${params.toString()}`
}
export function masterSelectionSummary(selection: MasterSelection) {
  const unit =
    masterUnitOptions.find(({ id }) => id === selection.unit)?.label ??
    selection.unit
  const main = masterDefinitions.find(({ id }) => id === selection.main)
  const mainLabel = main?.label ?? selection.main
  const subLabel =
    main?.subMasters?.find(({ id }) => id === selection.sub)?.label ?? mainLabel
  return `${unit} · ${mainLabel} · ${subLabel}`
}
export function masterSelectionHref(
  selection?: MasterSelection | null,
  view: MasterModuleView = "dataEntry"
) {
  const params = new URLSearchParams()
  if (selection) {
    params.set("unit", selection.unit)
    params.set("main", selection.main)
    params.set("sub", selection.sub)
  }
  if (view === "masterTables") params.set("view", view)
  const query = params.toString()
  return query ? `/masters?${query}` : "/masters"
}

export function masterSelectionFromContext(
  values: Pick<URLSearchParams, "get">
): MasterSelection | null {
  const unit = parseMasterUnit(values.get("masterUnit"))
  const main = values.get("masterMain")?.trim()
  const sub = values.get("masterSub")?.trim()
  return unit && main && sub ? { main, sub, unit } : null
}

const contextKeys = ["masterUnit", "masterMain", "masterSub"] as const

export function hasMasterSelectionContext(
  values: Pick<URLSearchParams, "get">
) {
  return contextKeys.some((key) => Boolean(values.get(key)))
}

export function withMasterSelectionContext(
  href: string,
  values: Pick<URLSearchParams, "get">
) {
  const [path = "", query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  for (const key of contextKeys) {
    const value = values.get(key)
    if (value) params.set(key, value)
  }
  const serialized = params.toString()
  return serialized ? `${path}?${serialized}` : path
}

export function masterSelectionMatchesDestination(
  selection: MasterSelection,
  pathname: string,
  values: Record<string, string | null | undefined>
) {
  if (pathname === "/") {
    const expectedEntry =
      selection.main === "rejection" ? selection.sub : selection.main
    return (
      values.entry === expectedEntry &&
      (selection.main !== "store_masters" ||
        values.storeMaster === selection.sub) &&
      (selection.unit === universalMasterUnit ||
        values.floor === selection.unit)
    )
  }
  if (pathname === "/hr") {
    return selection.main === "hr_masters"
      ? selection.sub === "approved_posts"
        ? values.panel === "approvedPostPanel"
        : selection.sub === "combined_approved_posts"
          ? values.panel === "combinedRolesPanel"
          : selection.sub === "candidates"
            ? values.panel === "candidatesPanel"
            : selection.sub === "employee_assignments"
              ? values.panel === "employeeMasterPanel"
              : selection.sub === "job_templates"
                ? values.panel === "postMasterPanel"
                : values.panel === "mastersPanel" &&
                  values.kind === selection.sub
      : false
  }
  if (pathname === "/commercial/masters") {
    return (
      (selection.main === "commercial_pricing_masters" ||
        (selection.main === "commercial_website_products" &&
          selection.sub !== selection.main)) &&
      values.kind === selection.sub
    )
  }
  if (pathname === "/commercial/customers") {
    return selection.main === "commercial_customers"
  }
  if (pathname === "/commercial/website-products") {
    return (
      selection.main === "commercial_website_products" &&
      selection.sub === selection.main
    )
  }
  return false
}
