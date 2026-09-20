"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"

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
    for (const row of rows) {
      const result = await importRow(master, row)
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
