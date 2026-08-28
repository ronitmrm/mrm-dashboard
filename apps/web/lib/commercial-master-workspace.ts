export const commercialMasterKinds = [
  {
    entryKind: "materialGrade",
    label: "Material grade",
    tableKind: "commercial_material_grade",
  },
  {
    entryKind: "rodType",
    label: "Rod type",
    tableKind: "commercial_rod_type",
  },
  {
    entryKind: "machineType",
    label: "Machine type",
    tableKind: "commercial_machine_type",
  },
  {
    entryKind: "category",
    label: "Design category",
    tableKind: "commercial_category",
  },
  {
    entryKind: "subcategory",
    label: "Design subcategory",
    tableKind: "commercial_subcategory",
  },
  {
    entryKind: "process",
    label: "Manufacturing process",
    tableKind: "commercial_process",
  },
  {
    entryKind: "application",
    label: "Website application",
    tableKind: "commercial_application",
  },
  {
    entryKind: "certification",
    label: "Website certification",
    tableKind: "commercial_certification",
  },
  {
    entryKind: "websiteField",
    label: "Website field option",
    tableKind: "commercial_website_field",
  },
  {
    entryKind: "materialRate",
    label: "Material rate",
    tableKind: "commercial_material_rate",
  },
  {
    entryKind: "shippingTerm",
    label: "Shipping term",
    tableKind: "commercial_shipping",
  },
  {
    entryKind: "packagingOption",
    label: "Packaging option",
    tableKind: "commercial_packaging",
  },
  {
    entryKind: "commercialTerm",
    label: "Buyer",
    tableKind: "commercial_commercial_term",
    termType: "buyer",
    workspaceKind: "buyer",
  },
  {
    entryKind: "commercialTerm",
    label: "Incoterms",
    tableKind: "commercial_commercial_term",
    termType: "incoterms",
    workspaceKind: "incoterms",
  },
  {
    entryKind: "commercialTerm",
    label: "Payment terms",
    tableKind: "commercial_commercial_term",
    termType: "payment_terms",
    workspaceKind: "payment_terms",
  },
  {
    entryKind: "commercialTerm",
    label: "Shipment mode",
    tableKind: "commercial_commercial_term",
    termType: "shipment_mode",
    workspaceKind: "shipment_mode",
  },
  {
    entryKind: "commercialTerm",
    label: "Packaging terms",
    tableKind: "commercial_commercial_term",
    termType: "packaging_terms",
    workspaceKind: "packaging_terms",
  },
  {
    entryKind: "quoteTerm",
    label: "Quote PDF term",
    tableKind: "commercial_quote_term",
  },
] as const

export type CommercialMasterEntryKind =
  (typeof commercialMasterKinds)[number]["entryKind"]
export type CommercialMasterTableKind =
  (typeof commercialMasterKinds)[number]["tableKind"]

export type CommercialMasterSelection = (typeof commercialMasterKinds)[number]

const customerDefaultCommercialTermTypes = new Set([
  "buyer",
  "incoterms",
  "payment_terms",
  "shipment_mode",
  "packaging_terms",
])

export function isCustomerDefaultCommercialMaster(
  selection: CommercialMasterSelection
) {
  return (
    "termType" in selection &&
    customerDefaultCommercialTermTypes.has(selection.termType)
  )
}

export function isCustomerDefaultCommercialTerm(termType: string) {
  return customerDefaultCommercialTermTypes.has(termType)
}

export function commercialMasterWorkspaceKind(
  selection: CommercialMasterSelection
) {
  return "workspaceKind" in selection
    ? selection.workspaceKind
    : selection.entryKind
}

const templateKeys = {
  application: "applications",
  category: "categories",
  certification: "certifications",
  commercialTerm: "commercials",
  machineType: "machines",
  materialGrade: "grades",
  materialRate: "materials",
  packagingOption: "packaging",
  process: "processes",
  quoteTerm: "quote-terms",
  rodType: "rod-types",
  shippingTerm: "shipping",
  subcategory: "subcategories",
  websiteField: "website-material",
} as const satisfies Record<CommercialMasterEntryKind, string>

const defaultSelection = commercialMasterKinds[0]

export function commercialMasterSelection(kind?: string | null) {
  return (
    commercialMasterKinds.find(
      (candidate) =>
        candidate.entryKind === kind ||
        candidate.tableKind === kind ||
        ("workspaceKind" in candidate && candidate.workspaceKind === kind)
    ) ?? defaultSelection
  )
}

export function commercialMasterViewHref(
  view: "dataEntry" | "masterTables",
  kind?: string | null
) {
  const selection = commercialMasterSelection(kind)
  const params = new URLSearchParams({
    masterView: view,
    kind: commercialMasterWorkspaceKind(selection),
  })
  return `/commercial/masters?${params.toString()}`
}

export function commercialMasterTemplateHref(kind?: string | null) {
  const selection = commercialMasterSelection(kind)
  const params = new URLSearchParams({
    master: templateKeys[selection.entryKind],
  })
  if ("termType" in selection) params.set("termType", selection.termType)
  return `/commercial/masters/template.csv?${params.toString()}`
}
