import type { StoreMasterData } from "../../app/store/masters/master-workspace"
import type { StoreMasterKey } from "../store-master-selection"

/** Send the selected master and the reference labels needed by its form. */
export function selectedStoreMasterData(
  data: StoreMasterData,
  master: StoreMasterKey,
  canSave: boolean
): StoreMasterData {
  const itemReferences = master === "SUPPLIER_PRICE" && canSave
  const classifications = master === "ITEM_TYPE" && canSave
  return {
    items:
      master === "ITEM_TYPE"
        ? data.items
        : itemReferences
          ? data.items.map(({ id, typeCode, identificationName, unit }) => ({
              id,
              typeCode,
              identificationName,
              unit,
              assetCategory: "",
              assetCategoryId: "",
              assetName: "",
              assetNameId: "",
              assetSubcategory: "",
              assetSubcategoryId: "",
              assetType: "",
            }))
          : [],
    itemDrawings: master === "ITEM_TYPE" ? data.itemDrawings : [],
    locations: master === "LOCATION" ? data.locations : [],
    suppliers:
      master === "SUPPLIER"
        ? data.suppliers
        : itemReferences
          ? data.suppliers.map(({ id, code, name }) => ({
              id,
              code,
              name,
              address: null,
              contactDetails: null,
              email: null,
              gstNumber: null,
            }))
          : [],
    supplierPrices: master === "SUPPLIER_PRICE" ? data.supplierPrices : [],
    vendors: master === "VENDOR" ? data.vendors : [],
    portfolioProducts: classifications ? data.portfolioProducts : [],
    masters: {
      categories:
        master === "CATEGORY" ||
        classifications ||
        (canSave && ["SUBCATEGORY", "ASSET_NAME"].includes(master))
          ? data.masters.categories
          : [],
      subcategories:
        master === "SUBCATEGORY" ||
        classifications ||
        (canSave && master === "ASSET_NAME")
          ? data.masters.subcategories
          : [],
      assetNames:
        master === "ASSET_NAME" || classifications
          ? data.masters.assetNames
          : [],
    },
  }
}
