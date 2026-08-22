import type { UnifiedNavigationAccess } from "./auth/unified-navigation-access"
import {
  masterUnitOptions,
  parseMasterUnit,
  universalMasterUnit,
  type MasterUnit,
} from "./master-module"

export type OperationalEntryView = "dataEntry" | "masterTables"

export type OperationalEntryModuleAccess = {
  enquiries: boolean
  productionDataEntry: boolean
  productionTables: boolean
  purchaseOrders: boolean
}

export type OperationalEntrySelection = {
  main: string
  sub: string
  unit: MasterUnit
}

export type OperationalEntryOption = {
  id: string
  label: string
}

const productionMain = {
  id: "production_entries",
  label: "Production Entries",
} as const

const commercialMain = {
  id: "commercial_entries",
  label: "Commercial Entries",
} as const

const productionEntries: readonly OperationalEntryOption[] = [
  { id: "work_order", label: "Work Order" },
  { id: "rm_inward", label: "Rm Inward" },
  { id: "software_raw", label: "Software Production Output" },
]

const commercialEntries: readonly (OperationalEntryOption & {
  access: "enquiries" | "purchaseOrders"
  views: readonly OperationalEntryView[]
})[] = [
  {
    access: "enquiries",
    id: "commercial_enquiries",
    label: "Enquiries",
    views: ["dataEntry", "masterTables"],
  },
  {
    access: "purchaseOrders",
    id: "commercial_purchase_orders",
    label: "Purchase Orders",
    views: ["dataEntry", "masterTables"],
  },
]

function productionAccessForView(
  access: OperationalEntryModuleAccess,
  view: OperationalEntryView
) {
  return view === "dataEntry"
    ? access.productionDataEntry
    : access.productionTables
}

export function operationalEntryModuleAccess(
  access: UnifiedNavigationAccess
): OperationalEntryModuleAccess {
  const canOpenProductionTab = (
    tab: "operationalEntryTab" | "operationalTablesTab"
  ) =>
    access.productionTabIds
      ? access.productionTabIds.includes(tab)
      : access.operations

  return {
    enquiries: access.commercialHrefs.includes("/commercial/enquiries"),
    productionDataEntry: canOpenProductionTab("operationalEntryTab"),
    productionTables: canOpenProductionTab("operationalTablesTab"),
    purchaseOrders: access.commercialHrefs.includes("/commercial/orders"),
  }
}

export const operationalEntryUnitOptions = masterUnitOptions

export function operationalSubEntriesFor(
  main: string,
  access: OperationalEntryModuleAccess,
  view: OperationalEntryView
): OperationalEntryOption[] {
  if (main === productionMain.id) {
    return productionAccessForView(access, view) ? [...productionEntries] : []
  }
  if (main === commercialMain.id) {
    return commercialEntries
      .filter((entry) => access[entry.access] && entry.views.includes(view))
      .map(({ id, label }) => ({ id, label }))
  }
  return []
}

export function availableOperationalEntryMains(
  unit: MasterUnit,
  access: OperationalEntryModuleAccess,
  view: OperationalEntryView
): OperationalEntryOption[] {
  if (unit === universalMasterUnit) {
    return operationalSubEntriesFor(commercialMain.id, access, view).length
      ? [commercialMain]
      : []
  }
  return productionAccessForView(access, view) ? [productionMain] : []
}

export function resolveOperationalEntrySelection(
  input: { main?: unknown; sub?: unknown; unit?: unknown },
  access: OperationalEntryModuleAccess,
  view: OperationalEntryView
): OperationalEntrySelection | null {
  const unit = parseMasterUnit(input.unit)
  const main = typeof input.main === "string" ? input.main : ""
  const sub = typeof input.sub === "string" ? input.sub : ""
  if (
    !unit ||
    !availableOperationalEntryMains(unit, access, view).some(
      (entry) => entry.id === main
    ) ||
    !operationalSubEntriesFor(main, access, view).some(
      (entry) => entry.id === sub
    )
  ) {
    return null
  }
  return { main, sub, unit }
}

function addOperationalContext(
  params: URLSearchParams,
  selection: OperationalEntrySelection
) {
  params.set("operationalUnit", selection.unit)
  params.set("operationalMain", selection.main)
  params.set("operationalSub", selection.sub)
}

export function operationalEntryFormHref(
  selection: OperationalEntrySelection,
  view: OperationalEntryView = "dataEntry"
) {
  const params = new URLSearchParams()
  if (selection.main === productionMain.id) {
    params.set(
      "tab",
      view === "dataEntry" ? "operationalEntryTab" : "operationalTablesTab"
    )
    params.set("floor", selection.unit)
    params.set("entry", selection.sub)
    addOperationalContext(params, selection)
    return "/?" + params.toString()
  }

  if (selection.sub === "commercial_enquiries") {
    params.set("operationalView", view)
    addOperationalContext(params, selection)
    return "/commercial/enquiries?" + params.toString()
  }

  params.set("operationalView", view)
  addOperationalContext(params, selection)
  return "/commercial/orders?" + params.toString()
}

export function operationalEntryOpenHref(
  selection: OperationalEntrySelection,
  view: OperationalEntryView = "dataEntry"
) {
  const params = new URLSearchParams({
    unit: selection.unit,
    main: selection.main,
    sub: selection.sub,
  })
  if (view === "masterTables") params.set("view", view)
  return "/operational-entry/open?" + params.toString()
}

export function operationalEntrySelectionHref(
  selection?: OperationalEntrySelection | null,
  view: OperationalEntryView = "dataEntry"
) {
  const params = new URLSearchParams()
  if (selection) {
    params.set("unit", selection.unit)
    params.set("main", selection.main)
    params.set("sub", selection.sub)
  }
  if (view === "masterTables") params.set("view", view)
  const query = params.toString()
  return query ? "/operational-entry?" + query : "/operational-entry"
}

export function operationalEntrySelectionFromContext(
  values: Pick<URLSearchParams, "get">
): OperationalEntrySelection | null {
  const unit = parseMasterUnit(values.get("operationalUnit"))
  const main = values.get("operationalMain")?.trim()
  const sub = values.get("operationalSub")?.trim()
  return unit && main && sub ? { main, sub, unit } : null
}

const operationalContextKeys = [
  "operationalUnit",
  "operationalMain",
  "operationalSub",
] as const

export function withOperationalEntrySelectionContext(
  href: string,
  values: Pick<URLSearchParams, "get">
) {
  const [path = "", query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  for (const key of operationalContextKeys) {
    const value = values.get(key)
    if (value) params.set(key, value)
  }
  const serialized = params.toString()
  return serialized ? path + "?" + serialized : path
}

export function operationalEntrySelectionSummary(
  selection: OperationalEntrySelection
) {
  const unit =
    operationalEntryUnitOptions.find(({ id }) => id === selection.unit)
      ?.label ?? selection.unit
  const main =
    [productionMain, commercialMain].find(({ id }) => id === selection.main)
      ?.label ?? selection.main
  const sub =
    [...productionEntries, ...commercialEntries].find(
      ({ id }) => id === selection.sub
    )?.label ?? selection.sub
  return [unit, main, sub].join(" · ")
}

export function operationalEntrySelectionMatchesDestination(
  selection: OperationalEntrySelection,
  pathname: string,
  values: Record<string, string | null | undefined>
) {
  if (selection.main === productionMain.id) {
    return (
      pathname === "/" &&
      ["operationalEntryTab", "operationalTablesTab"].includes(
        values.tab ?? ""
      ) &&
      values.floor === selection.unit &&
      values.entry === selection.sub
    )
  }
  if (selection.sub === "commercial_enquiries") {
    return pathname === "/commercial/enquiries"
  }
  return pathname === "/commercial/orders"
}
