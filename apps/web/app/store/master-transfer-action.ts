"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { createStoreRepository } from "@workspace/db"
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

export async function importStoreMasterCsvAction(formData: FormData) {
  const master = normalizeStoreMasterKey(formData.get("store_master"))
  await requireCapability(masterCapability(master, "import"), "/masters")
  let imported = 0
  try {
    const rows = await readMasterCsv(formData.get("master_csv_file"))
    const classifications = master === "ITEM_TYPE" ? await readClassifications() : null
    for (const row of rows) {
      const result = await importRow(
        master,
        classifications ? resolveClassification(row, classifications) : row
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

async function readClassifications() {
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return await repository.listAssetClassificationMasters(organizationId)
  } finally {
    await repository.close()
  }
}

function classificationId(
  value: string,
  options: { id: string; name: string }[],
  label: string
) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) throw new Error(`${label} is required.`)
  const matches = options.filter(
    (option) => option.id.toLowerCase() === normalized || option.name.trim().toLowerCase() === normalized
  )
  if (matches.length !== 1) {
    throw new Error(
      matches.length
        ? `${label} "${value}" is ambiguous. Use its master ID.`
        : `${label} "${value}" was not found in the selected classification. Check the Store Classification Master.`
    )
  }
  return matches[0]!.id
}

function resolveClassification(
  row: MasterCsvRow,
  masters: Awaited<ReturnType<typeof readClassifications>>
) {
  const categoryId = classificationId(
    csvValue(row, "asset_category", "asset_category_name", "category", "asset_category_id"),
    masters.categories,
    "Asset Category"
  )
  const subcategoryId = classificationId(
    csvValue(row, "asset_subcategory", "asset_subcategory_name", "subcategory", "asset_subcategory_id"),
    masters.subcategories.filter((option) => option.categoryId === categoryId),
    "Asset Subcategory"
  )
  const assetNameId = classificationId(
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
          asset_subcategory_name: ["name", "subcategory"],
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
        form(row, {
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
        form(row, {
          item_type_id: [],
          quote_reference: [],
          supplier_id: [],
          unit_price: [],
          valid_from: [],
        })
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
