import type { CommercialMasterSnapshot } from "@workspace/db"
import { commercialMasterKinds, type CommercialMasterEntryKind } from "../commercial-master-workspace"
import { masterCapability } from "./master-capabilities"

export function commercialMasterFormOptions(
  snapshot: Pick<CommercialMasterSnapshot, "categories" | "materialGrades" | "rodTypes">,
  kind: CommercialMasterEntryKind
) {
  return {
    categories: kind === "subcategory" ? snapshot.categories.map(({ name }) => ({ name })) : [],
    materialGrades: kind === "materialRate" ? snapshot.materialGrades.map(({ name }) => ({ name })) : [],
    rodTypes: kind === "materialRate" ? snapshot.rodTypes.map(({ name }) => ({ name })) : [],
  }
}

const templateMasters = {
  customers: "commercial_customers",
  machines: "machineType",
  grades: "materialGrade",
  "rod-types": "rodType",
  "rod-sizes": "rodSize",
  categories: "category",
  subcategories: "subcategory",
  processes: "process",
  applications: "application",
  certifications: "certification",
  "website-material": "websiteField",
  "website-connections": "websiteField",
  "website-pressure": "websiteField",
  "website-temperature": "websiteField",
  "website-sealant": "websiteField",
  materials: "materialRate",
  shipping: "shippingTerm",
  packaging: "packagingOption",
  "quote-terms": "quoteTerm",
} as const

export function commercialTemplateReadCapabilities(key?: string, termType?: string | null) {
  const terms = commercialMasterKinds.flatMap((selection) => "termType" in selection ? [selection.termType] : [])
  if (key === "commercials") {
    if (termType && !terms.some((term) => term === termType)) throw new Error("Unknown commercial term type.")
    return (termType ? [termType] : terms).map((master) => masterCapability(master, "read"))
  }
  if (!key) return [...new Set([...Object.values(templateMasters), ...terms])].map((master) => masterCapability(master, "read"))
  if (!(key in templateMasters)) throw new Error("Unknown master template.")
  return [masterCapability(templateMasters[key as keyof typeof templateMasters], "read")]
}

export const commercialSnapshotMasters = {
  applications: "application", categories: "category", certifications: "certification",
  customers: "commercial_customers", machineTypes: "machineType", materialGrades: "materialGrade",
  materialRates: "materialRate", packagingOptions: "packagingOption", processes: "process",
  quoteTerms: "quoteTerm", rodTypes: "rodType", shippingTerms: "shippingTerm",
  rodSizes: "rodSize",
  subcategories: "subcategory", websiteFields: "websiteField",
} as const satisfies Record<Exclude<keyof CommercialMasterSnapshot, "commercialTerms">, string>

export function commercialImportCapabilities(snapshot: CommercialMasterSnapshot) {
  return [...new Set([
    ...Object.entries(commercialSnapshotMasters).filter(([key]) => snapshot[key as keyof typeof commercialSnapshotMasters].length > 0).map(([, master]) => masterCapability(master, "import")),
    ...snapshot.commercialTerms.map(({ termType }) => masterCapability(termType, "import")),
    // Workbook customer rows upsert by UID; the customer CSV action only creates.
    ...(snapshot.customers.length ? [masterCapability("commercial_customers", "update")] : []),
  ])]
}

export function readableCommercialSnapshot(snapshot: CommercialMasterSnapshot, grants: readonly string[]): CommercialMasterSnapshot {
  const allowed = new Set(grants)
  const selected = { ...snapshot }
  for (const [key, master] of Object.entries(commercialSnapshotMasters)) {
    if (!allowed.has(masterCapability(master, "read"))) selected[key as keyof typeof commercialSnapshotMasters] = []
  }
  selected.commercialTerms = snapshot.commercialTerms.filter(({ termType }) => allowed.has(`masters.universal.${termType}.read`))
  return selected
}
