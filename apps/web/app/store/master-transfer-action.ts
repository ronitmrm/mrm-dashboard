"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { createStoreRepository } from "@workspace/db"
import { storeUnitValue } from "@/lib/store-units"
import { readAuthEnvironment } from "@/lib/auth/auth"

import {
  csvValue,
  readMasterCsv,
  type MasterCsvRow,
} from "@/lib/master-data-csv"
import {
  normalizeStoreMasterKey,
  type StoreMasterKey,
} from "@/lib/store-master-selection"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import {
  createStoreAssetCategoryAction,
  createStoreAssetNameAction,
  createStoreAssetSubcategoryAction,
  createStoreItemTypeAction,
  createStoreLocationAction,
  createStoreSupplierAction,
  createStoreSupplierPriceAction,
  createStoreVendorAction,
} from "./actions"

function form(row: MasterCsvRow, fields: Record<string, string[]>) {
  const formData = new FormData()
  for (const [field, aliases] of Object.entries(fields)) {
    formData.set(field, csvValue(row, field, ...aliases))
  }
  return formData
}

function normalizedCsvDate(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""

  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed)
  const normalized = dayFirst
    ? `${dayFirst[3]!}-${dayFirst[2]!.padStart(2, "0")}-${dayFirst[1]!.padStart(2, "0")}`
    : trimmed
  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error(
      `${label} must be a valid date in YYYY-MM-DD, DD-MM-YYYY, or DD/MM/YYYY format.`
    )
  }
  return normalized
}

export async function importStoreMasterCsvAction(formData: FormData) {
  const master = normalizeStoreMasterKey(formData.get("store_master"))
  await requireCapability(masterCapability(master, "import"), "/masters")
  let imported = 0
  try {
    const rows = await readMasterCsv(formData.get("master_csv_file"))
    const references = await readReferences(master)
    for (const row of rows) {
      const result = await importRow(
        master,
        resolveReferences(master, row, references)
      )
      if (result?.error) throw new Error(result.error)
      imported += 1
    }
  } catch (error) {
    unstable_rethrow(error)
    return {
      error: `Row ${imported + 2}: ${error instanceof Error ? error.message : "Import failed."} ${imported} row(s) imported before stopping.`,
    }
  } finally {
    revalidatePath("/store/masters")
    revalidatePath("/")
  }
}

async function readReferences(master: StoreMasterKey) {
  if (!["ITEM_TYPE", "SUBCATEGORY", "ASSET_NAME", "SUPPLIER_PRICE"].includes(master)) return null
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    if (master === "SUPPLIER_PRICE") {
      const [suppliers, items] = await Promise.all([
        repository.listSuppliers(organizationId),
        repository.listItemTypes(organizationId),
      ])
      return { kind: "prices" as const, suppliers, items }
    }
    return { kind: "classification" as const, ...await repository.listAssetClassificationMasters(organizationId) }
  } finally {
    await repository.close()
  }
}

function referenceId(
  value: string,
  options: { id: string; name: string; code?: string }[],
  label: string
) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) throw new Error(`${label} is required.`)
  const matches = options.filter(
    (option) => option.id.toLowerCase() === normalized || option.name.trim().toLowerCase() === normalized || option.code?.toLowerCase() === normalized
  )
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `${label} "${value}" is ambiguous. Specify its parent Category, unique code, or master ID.`
        : `${label} "${value}" was not found in the selected master records. Check the name/code and parent classification.`
    )
  }
  return matches[0]!.id
}

function resolveReferences(
  master: StoreMasterKey,
  row: MasterCsvRow,
  masters: Awaited<ReturnType<typeof readReferences>>
) {
  if (!masters) return row
  if (masters.kind === "prices") {
    return {
      ...row,
      supplier_id: referenceId(
        csvValue(row, "supplier", "supplier_name", "supplier_code", "supplier_id"),
        masters.suppliers,
        "Supplier"
      ),
      item_type_id: referenceId(
        csvValue(row, "asset_code", "item_code", "item_type_id"),
        masters.items.map((item) => ({ id: item.id, name: item.typeCode })),
        "Asset Code"
      ),
    }
  }
  const category = csvValue(row, "asset_category", "asset_category_name", "category", "asset_category_id", "category_id")
  if (master === "ASSET_NAME") {
    const categoryId = category ? referenceId(category, masters.categories, "Asset Category") : null
    return {
      ...row,
      asset_subcategory_id: referenceId(
        csvValue(row, "asset_subcategory", "asset_subcategory_name", "subcategory", "asset_subcategory_id", "subcategory_id"),
        masters.subcategories.filter((option) => !categoryId || option.categoryId === categoryId),
        "Asset Subcategory"
      ),
    }
  }
  const categoryId = referenceId(
    category,
    masters.categories,
    "Asset Category"
  )
  if (master === "SUBCATEGORY") return { ...row, asset_category_id: categoryId }
  const subcategoryId = referenceId(
    csvValue(row, "asset_subcategory", "asset_subcategory_name", "subcategory", "asset_subcategory_id"),
    masters.subcategories.filter((option) => option.categoryId === categoryId),
    "Asset Subcategory"
  )
  const assetNameId = referenceId(
    csvValue(row, "asset_name", "asset_name_id"),
    masters.assetNames.filter((option) => option.subcategoryId === subcategoryId),
    "Asset Name"
  )
  return { ...row, asset_category_id: categoryId, asset_subcategory_id: subcategoryId, asset_name_id: assetNameId }
}

async function importRow(master: StoreMasterKey, row: MasterCsvRow) {
  switch (master) {
    case "CATEGORY":
      return createStoreAssetCategoryAction(
        form(row, { asset_category_name: ["name", "category"] })
      )
    case "SUBCATEGORY":
      return createStoreAssetSubcategoryAction(
        form(row, {
          asset_category_id: ["category_id"],
          asset_subcategory_name: ["name", "subcategory", "asset_subcategory"],
        })
      )
    case "ASSET_NAME":
      return createStoreAssetNameAction(
        form(row, {
          asset_name: ["name"],
          asset_subcategory_id: ["subcategory_id"],
        })
      )
    case "LOCATION":
      return createStoreLocationAction(
        form({ ...row, location_type: csvValue(row, "location_type", "type").toUpperCase() }, {
          location_code: ["code"],
          location_name: ["name"],
          location_type: ["type"],
        })
      )
    case "SUPPLIER":
      return createStoreSupplierAction(
        form(row, {
          contact_details: [],
          gst_number: [],
          supplier_address: ["address"],
          supplier_email: ["email"],
          supplier_name: ["name"],
        })
      )
    case "SUPPLIER_PRICE":
      return createStoreSupplierPriceAction(
        form(
          {
            ...row,
            valid_from: normalizedCsvDate(
              csvValue(row, "valid_from"),
              "Valid From"
            ),
          },
          {
            item_type_id: [],
            quote_reference: [],
            supplier_id: [],
            unit_price: [],
            valid_from: [],
          }
        )
      )
    case "VENDOR":
      return createStoreVendorAction(
        form(row, {
          contact_details: [],
          vendor_code: ["code"],
          vendor_name: ["name"],
        })
      )
    case "ITEM_TYPE":
      return createStoreItemTypeAction(
        form(
          {
            ...row,
            unit: storeUnitValue(csvValue(row, "unit")),
            asset_type: csvValue(row, "asset_type")
              .toUpperCase()
              .replace(/[\s-]+/g, "_"),
          },
          {
            applicable_item_code: [],
            asset_category_id: [],
            asset_name_id: [],
            asset_subcategory_id: [],
            asset_type: [],
            identification_name: ["name", "identification"],
            minimum_stock: [],
            unit: [],
          }
        )
      )
  }
}
