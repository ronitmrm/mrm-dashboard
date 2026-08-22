"use server"

import { revalidatePath } from "next/cache"

import {
  csvValue,
  readMasterCsv,
  type MasterCsvRow,
} from "@/lib/master-data-csv"
import { normalizeStoreMasterKey } from "@/lib/store-master-selection"

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
  const rows = await readMasterCsv(formData.get("master_csv_file"))
  for (const row of rows) {
    switch (master) {
      case "CATEGORY":
        await createStoreAssetCategoryAction(
          form(row, { asset_category_name: ["name", "category"] })
        )
        break
      case "SUBCATEGORY":
        await createStoreAssetSubcategoryAction(
          form(row, {
            asset_category_id: ["category_id"],
            asset_subcategory_name: ["name", "subcategory"],
          })
        )
        break
      case "ASSET_NAME":
        await createStoreAssetNameAction(
          form(row, {
            asset_name: ["name"],
            asset_subcategory_id: ["subcategory_id"],
          })
        )
        break
      case "LOCATION":
        await createStoreLocationAction(
          form(row, {
            location_code: ["code"],
            location_name: ["name"],
            location_type: ["type"],
          })
        )
        break
      case "SUPPLIER":
        await createStoreSupplierAction(
          form(row, {
            contact_details: [],
            gst_number: [],
            supplier_address: ["address"],
            supplier_email: ["email"],
            supplier_name: ["name"],
          })
        )
        break
      case "SUPPLIER_PRICE":
        await createStoreSupplierPriceAction(
          form(row, {
            item_type_id: [],
            quote_reference: [],
            supplier_id: [],
            unit_price: [],
            valid_from: [],
          })
        )
        break
      case "VENDOR":
        await createStoreVendorAction(
          form(row, {
            contact_details: [],
            vendor_code: ["code"],
            vendor_name: ["name"],
          })
        )
        break
      case "ITEM_TYPE":
        await createStoreItemTypeAction(
          form(row, {
            applicable_item_code: [],
            asset_category_id: [],
            asset_name_id: [],
            asset_subcategory_id: [],
            asset_type: [],
            drawing_number: [],
            identification_name: ["name", "identification"],
            minimum_stock: [],
            unit: [],
          })
        )
        break
    }
  }
  revalidatePath("/store/masters")
}
