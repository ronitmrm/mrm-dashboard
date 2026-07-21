import type { CommercialMasterSnapshot, WebsiteFieldType } from "@workspace/db"
import * as XLSX from "xlsx"

type MasterImportCell = boolean | null | number | string | undefined
type MasterImportRow = Record<string, MasterImportCell>

type SheetDefinition = {
  key: string
  name: string
  placeholder: MasterImportRow
  widths: number[]
}

const sheetDefinitions: SheetDefinition[] = [
  {
    key: "customers",
    name: "Customers",
    placeholder: {
      company_name: "",
      country: "",
      customer_uid: "",
      email: "",
      phone: "",
    },
    widths: [16, 32, 28, 18, 18],
  },
  {
    key: "machines",
    name: "Machine Types",
    placeholder: { name: "" },
    widths: [24],
  },
  {
    key: "grades",
    name: "Grades",
    placeholder: { name: "" },
    widths: [24],
  },
  {
    key: "rod-types",
    name: "Rod Types",
    placeholder: { name: "" },
    widths: [32],
  },
  {
    key: "categories",
    name: "Categories",
    placeholder: { category: "", category_code: "" },
    widths: [34, 16],
  },
  {
    key: "subcategories",
    name: "Sub Categories",
    placeholder: {
      category: "",
      combination_code: "",
      sub_category: "",
    },
    widths: [34, 42, 18],
  },
  {
    key: "processes",
    name: "Processes",
    placeholder: { name: "" },
    widths: [28],
  },
  {
    key: "applications",
    name: "Applications",
    placeholder: { name: "", sort_order: "" },
    widths: [28, 12],
  },
  {
    key: "certifications",
    name: "Certifications",
    placeholder: { name: "", sort_order: "" },
    widths: [28, 12],
  },
  {
    key: "website-material",
    name: "Website Fields",
    placeholder: { field_type: "material", name: "", sort_order: "" },
    widths: [18, 38, 12],
  },
  {
    key: "website-connections",
    name: "Website Connections",
    placeholder: { field_type: "connections", name: "", sort_order: "" },
    widths: [18, 38, 12],
  },
  {
    key: "website-pressure",
    name: "Website Pressure",
    placeholder: { field_type: "pressure", name: "", sort_order: "" },
    widths: [18, 38, 12],
  },
  {
    key: "website-temperature",
    name: "Website Temperature",
    placeholder: { field_type: "temperature", name: "", sort_order: "" },
    widths: [18, 38, 12],
  },
  {
    key: "website-sealant",
    name: "Website Sealant",
    placeholder: { field_type: "sealant", name: "", sort_order: "" },
    widths: [18, 38, 12],
  },
  {
    key: "materials",
    name: "Material Rates",
    placeholder: {
      alloy_premium: "",
      ext_cost: "",
      grade: "",
      rod_type: "",
    },
    widths: [18, 18, 18, 18],
  },
  {
    key: "shipping",
    name: "Shipping",
    placeholder: { name: "", shipping_cost: "" },
    widths: [24, 18],
  },
  {
    key: "packaging",
    name: "Packaging",
    placeholder: { name: "", packing_cost: "" },
    widths: [28, 18],
  },
  {
    key: "commercials",
    name: "Commercial Terms",
    placeholder: { name: "", term_type: "incoterms" },
    widths: [20, 56],
  },
  {
    key: "quote-terms",
    name: "Quote PDF Terms",
    placeholder: { label: "", sort_order: "", term_key: "", value: "" },
    widths: [20, 24, 72, 12],
  },
]

const websiteSheets: Array<{
  fieldType: WebsiteFieldType
  name: string
}> = [
  { fieldType: "material", name: "Website Fields" },
  { fieldType: "connections", name: "Website Connections" },
  { fieldType: "pressure", name: "Website Pressure" },
  { fieldType: "temperature", name: "Website Temperature" },
  { fieldType: "sealant", name: "Website Sealant" },
]

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function rows(sheet?: XLSX.WorkSheet) {
  if (!sheet) return [] as MasterImportRow[]
  return XLSX.utils
    .sheet_to_json<MasterImportRow>(sheet, { defval: "" })
    .map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
        ) as MasterImportRow
    )
    .filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim().length > 0)
    )
}

function cell(row: MasterImportRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeKey(key)]
    if (
      value !== null &&
      value !== undefined &&
      String(value).trim().length > 0
    ) {
      return String(value).trim()
    }
  }
  return ""
}

function numeric(row: MasterImportRow, ...keys: string[]) {
  const parsed = Number(cell(row, ...keys))
  return Number.isFinite(parsed) ? parsed : 0
}

function active(row: MasterImportRow) {
  const value = cell(row, "active").toLowerCase()
  return !["false", "inactive", "in active", "0", "no"].includes(value)
}

function optional(value: string) {
  return value || null
}

function snapshotRows(
  definition: SheetDefinition,
  snapshot: CommercialMasterSnapshot
): MasterImportRow[] {
  switch (definition.key) {
    case "customers":
      return snapshot.customers.map((row) => ({
        company_name: row.companyName,
        country: row.country ?? "",
        customer_uid: row.customerUid,
        email: row.email ?? "",
        phone: row.phone ?? "",
        status: row.status,
      }))
    case "machines":
      return snapshot.machineTypes
    case "grades":
      return snapshot.materialGrades
    case "rod-types":
      return snapshot.rodTypes
    case "categories":
      return snapshot.categories.map((row) => ({
        category: row.name,
        category_code: row.code ?? "",
      }))
    case "subcategories":
      return snapshot.subcategories.map((row) => ({
        category: row.category,
        combination_code: row.combinationCode ?? "",
        sub_category: row.name,
      }))
    case "processes":
      return snapshot.processes
    case "applications":
      return snapshot.applications.map((row) => ({
        name: row.name,
        sort_order: row.sortOrder,
      }))
    case "certifications":
      return snapshot.certifications.map((row) => ({
        name: row.name,
        sort_order: row.sortOrder,
      }))
    case "materials":
      return snapshot.materialRates.map((row) => ({
        active: row.active,
        alloy_premium: row.alloyPremium,
        ext_cost: row.extrusionCost,
        grade: row.grade,
        rod_type: row.rodType,
      }))
    case "shipping":
      return snapshot.shippingTerms.map((row) => ({
        active: row.active,
        name: row.name,
        shipping_cost: row.shippingCost,
      }))
    case "packaging":
      return snapshot.packagingOptions.map((row) => ({
        active: row.active,
        name: row.name,
        packing_cost: row.packingCost,
      }))
    case "commercials":
      return snapshot.commercialTerms.map((row) => ({
        active: row.active,
        name: row.name,
        term_type: row.termType,
      }))
    case "quote-terms":
      return snapshot.quoteTerms.map((row) => ({
        active: row.active,
        label: row.label,
        sort_order: row.sortOrder,
        term_key: row.termKey,
        value: row.value,
      }))
    default: {
      const fieldType = definition.placeholder.field_type as
        | WebsiteFieldType
        | undefined
      return fieldType
        ? snapshot.websiteFields
            .filter((row) => row.fieldType === fieldType)
            .map((row) => ({
              field_type: row.fieldType,
              name: row.name,
              sort_order: row.sortOrder,
            }))
        : []
    }
  }
}

export function buildMastersWorkbook(
  snapshot?: CommercialMasterSnapshot,
  selectedKey?: string
) {
  const workbook = XLSX.utils.book_new()
  const selected = selectedKey
    ? sheetDefinitions.filter((definition) => definition.key === selectedKey)
    : sheetDefinitions

  for (const definition of selected) {
    const data = snapshot
      ? snapshotRows(definition, snapshot)
      : [definition.placeholder]
    const sheet = XLSX.utils.json_to_sheet(
      data.length ? data : [definition.placeholder]
    )
    sheet["!cols"] = definition.widths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(workbook, sheet, definition.name)
  }
  return workbook
}

export function masterTemplateFilename(selectedKey?: string) {
  return selectedKey
    ? `${selectedKey}-master-template.xlsx`
    : "masters-template.xlsx"
}

export function parseMastersWorkbook(
  workbook: XLSX.WorkBook
): CommercialMasterSnapshot {
  const result: CommercialMasterSnapshot = {
    applications: [],
    categories: [],
    certifications: [],
    commercialTerms: [],
    customers: [],
    machineTypes: [],
    materialGrades: [],
    materialRates: [],
    packagingOptions: [],
    processes: [],
    quoteTerms: [],
    rodTypes: [],
    shippingTerms: [],
    subcategories: [],
    websiteFields: [],
  }

  for (const row of rows(workbook.Sheets["Customers"])) {
    const companyName = cell(row, "company_name", "company")
    if (!companyName) continue
    result.customers.push({
      companyName,
      country: optional(cell(row, "country")),
      customerUid: cell(row, "customer_uid", "uid"),
      email: optional(cell(row, "email")),
      phone: optional(cell(row, "phone")),
      status: cell(row, "status") || "Active",
    })
  }
  for (const row of rows(workbook.Sheets["Machine Types"])) {
    const name = cell(row, "name", "machine_type")
    if (name) result.machineTypes.push({ name })
  }
  for (const row of rows(workbook.Sheets["Grades"])) {
    const name = cell(row, "name", "grade")
    if (name) result.materialGrades.push({ name })
  }
  for (const row of rows(workbook.Sheets["Rod Types"])) {
    const name = cell(row, "name", "rod_type")
    if (name) result.rodTypes.push({ name })
  }
  for (const row of rows(workbook.Sheets["Categories"])) {
    const name = cell(row, "category", "category_name", "name")
    if (name)
      result.categories.push({
        code: optional(cell(row, "category_code", "code")),
        name,
      })
  }
  for (const row of rows(workbook.Sheets["Sub Categories"])) {
    const category = cell(row, "category", "category_name")
    const name = cell(row, "sub_category", "subcategory", "name")
    if (category && name)
      result.subcategories.push({
        category,
        combinationCode: optional(cell(row, "combination_code", "code")),
        name,
      })
  }
  for (const row of rows(workbook.Sheets["Processes"])) {
    const name = cell(row, "name", "process")
    if (name) result.processes.push({ name })
  }
  for (const row of rows(workbook.Sheets["Applications"])) {
    const name = cell(row, "name", "application")
    if (name)
      result.applications.push({
        name,
        sortOrder: numeric(row, "sort_order"),
      })
  }
  for (const row of rows(workbook.Sheets["Certifications"])) {
    const name = cell(row, "name", "certification")
    if (name)
      result.certifications.push({
        name,
        sortOrder: numeric(row, "sort_order"),
      })
  }
  for (const websiteSheet of websiteSheets) {
    for (const row of rows(workbook.Sheets[websiteSheet.name])) {
      const fieldType = (
        cell(row, "field_type", "type") || websiteSheet.fieldType
      ).toLowerCase() as WebsiteFieldType
      const name = cell(row, "name", "value")
      if (name && websiteSheets.some((item) => item.fieldType === fieldType)) {
        result.websiteFields.push({
          fieldType,
          name,
          sortOrder: numeric(row, "sort_order"),
        })
      }
    }
  }
  for (const row of rows(workbook.Sheets["Material Rates"])) {
    const grade = cell(row, "grade")
    const rodType = cell(row, "rod_type")
    if (grade && rodType)
      result.materialRates.push({
        active: active(row),
        alloyPremium: numeric(row, "alloy_premium"),
        extrusionCost: numeric(row, "ext_cost"),
        grade,
        rodType,
      })
  }
  for (const row of rows(workbook.Sheets["Shipping"])) {
    const name = cell(row, "name", "term")
    if (name)
      result.shippingTerms.push({
        active: active(row),
        name,
        shippingCost: numeric(row, "shipping_cost"),
      })
  }
  for (const row of rows(workbook.Sheets["Packaging"])) {
    const name = cell(row, "name", "packaging")
    if (name)
      result.packagingOptions.push({
        active: active(row),
        costBasis: "Per 100 pcs",
        name,
        packingCost: numeric(row, "packing_cost"),
      })
  }
  for (const row of rows(workbook.Sheets["Commercial Terms"])) {
    const termType = cell(row, "term_type", "type")
    const name = cell(row, "name", "value")
    if (
      name &&
      [
        "incoterms",
        "payment_terms",
        "shipment_mode",
        "packaging_terms",
      ].includes(termType)
    ) {
      result.commercialTerms.push({
        active: active(row),
        name,
        termType:
          termType as CommercialMasterSnapshot["commercialTerms"][number]["termType"],
      })
    }
  }
  const quoteRows = [
    ...rows(workbook.Sheets["Quote PDF Terms"]),
    ...rows(workbook.Sheets["Quote Terms"]),
  ]
  for (const row of quoteRows) {
    const termKey = cell(row, "term_key", "key")
    const label = cell(row, "label")
    const value = cell(row, "value", "text")
    if (termKey && label && value)
      result.quoteTerms.push({
        active: active(row),
        label,
        sortOrder: numeric(row, "sort_order") || 100,
        termKey,
        value,
      })
  }

  return result
}
