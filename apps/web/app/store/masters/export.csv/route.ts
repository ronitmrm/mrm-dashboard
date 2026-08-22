import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCsvResponse } from "@/lib/master-data-csv"
import { normalizeStoreMasterKey } from "@/lib/store-master-selection"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  await requireCapability("store.masters.read", "/store/masters")
  const master = normalizeStoreMasterKey(
    new URL(request.url).searchParams.get("storeMaster")
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    if (master === "CATEGORY") {
      const rows = (
        await repository.listAssetClassificationMasters(organizationId)
      ).categories
      return masterCsvResponse(
        rows.map((row) => ({ Name: row.name })),
        "store-category-master.csv"
      )
    }
    if (master === "SUBCATEGORY") {
      const rows = (
        await repository.listAssetClassificationMasters(organizationId)
      ).subcategories
      return masterCsvResponse(
        rows.map((row) => ({
          "Category Id": row.categoryId,
          Category: row.categoryName,
          Name: row.name,
        })),
        "store-subcategory-master.csv"
      )
    }
    if (master === "ASSET_NAME") {
      const rows = (
        await repository.listAssetClassificationMasters(organizationId)
      ).assetNames
      return masterCsvResponse(
        rows.map((row) => ({
          "Subcategory Id": row.subcategoryId,
          Category: row.categoryName,
          Subcategory: row.subcategoryName,
          Name: row.name,
        })),
        "store-asset-name-master.csv"
      )
    }
    if (master === "LOCATION") {
      const rows = await repository.listLocations(organizationId)
      return masterCsvResponse(
        rows.map((row) => ({
          Code: row.code,
          Name: row.name,
          Type: row.locationType,
        })),
        "store-location-master.csv"
      )
    }
    if (master === "SUPPLIER") {
      const rows = await repository.listSuppliers(organizationId)
      return masterCsvResponse(
        rows.map((row) => ({
          Code: row.code,
          Name: row.name,
          "GST Number": row.gstNumber,
          Email: row.email,
          "Contact Details": row.contactDetails,
          Address: row.address,
        })),
        "store-supplier-master.csv"
      )
    }
    if (master === "SUPPLIER_PRICE") {
      const rows = await repository.listSupplierPrices(organizationId)
      return masterCsvResponse(
        rows.map((row) => ({
          "Item Type Id": row.itemTypeId,
          "Supplier Id": row.supplierId,
          "Item Code": row.typeCode,
          Supplier: row.supplierName,
          "Unit Price": row.unitPrice,
          "Valid From": row.validFrom,
          "Quote Reference": row.quoteReference,
        })),
        "store-supplier-price-master.csv"
      )
    }
    if (master === "VENDOR") {
      const rows = await repository.listVendors(organizationId)
      return masterCsvResponse(
        rows.map((row) => ({
          Code: row.code,
          Name: row.name,
          "Contact Details": row.contactDetails,
        })),
        "store-vendor-master.csv"
      )
    }
    const rows = await repository.listItemTypes(organizationId)
    return masterCsvResponse(
      rows.map((row) => ({
        "Asset Code": row.typeCode,
        "Asset Category Id": row.assetCategoryId,
        "Asset Subcategory Id": row.assetSubcategoryId,
        "Asset Name Id": row.assetNameId,
        "Asset Type": row.assetType,
        Identification: row.identificationName,
        "Applicable Item Code": row.applicableItemCode,
        "Drawing Number": row.drawingNumber,
        Unit: row.unit,
        "Minimum Stock": row.minimumStock,
      })),
      "store-item-type-master.csv"
    )
  } finally {
    await repository.close()
  }
}
