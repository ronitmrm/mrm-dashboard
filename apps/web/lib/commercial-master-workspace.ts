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
    label: "Design process",
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
    label: "Commercial term",
    tableKind: "commercial_commercial_term",
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

const defaultSelection = commercialMasterKinds[0]

export function commercialMasterSelection(kind?: string | null) {
  return (
    commercialMasterKinds.find(
      (candidate) =>
        candidate.entryKind === kind || candidate.tableKind === kind
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
    kind: selection.entryKind,
  })
  return `/commercial/masters?${params.toString()}`
}
