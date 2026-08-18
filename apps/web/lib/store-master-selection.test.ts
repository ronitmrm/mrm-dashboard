import { describe, expect, it } from "vitest"

import {
  findExistingStoreItem,
  storeMasterShowsCode,
} from "./store-master-selection"

describe("Store master table columns", () => {
  it("shows codes only for masters that own a business code", () => {
    expect(storeMasterShowsCode("CATEGORY")).toBe(false)
    expect(storeMasterShowsCode("SUBCATEGORY")).toBe(false)
    expect(storeMasterShowsCode("ASSET_NAME")).toBe(false)
    expect(storeMasterShowsCode("ITEM_TYPE")).toBe(true)
    expect(storeMasterShowsCode("LOCATION")).toBe(true)
  })
})

describe("Store Item Data Entry", () => {
  const items = [
    {
      assetCategoryId: "category-a",
      assetNameId: "asset-a",
      assetSubcategoryId: "subcategory-a",
      assetType: "NON_CONSUMABLE",
      id: "item-a",
      identificationName: "Existing Drill",
      typeCode: "NC001",
    },
  ]

  it("returns the existing Asset Code for the same classification combination", () => {
    expect(
      findExistingStoreItem(items, {
        assetCategoryId: "category-a",
        assetNameId: "asset-a",
        assetSubcategoryId: "subcategory-a",
        assetType: "NON_CONSUMABLE",
      })
    ).toEqual(items[0])
  })

  it("does not reuse the code when any part of the combination changes", () => {
    expect(
      findExistingStoreItem(items, {
        assetCategoryId: "category-a",
        assetNameId: "asset-a",
        assetSubcategoryId: "subcategory-a",
        assetType: "CONSUMABLE",
      })
    ).toBeNull()
  })

  it("does not treat the item being edited as a duplicate of itself", () => {
    expect(
      findExistingStoreItem(
        items,
        {
          assetCategoryId: "category-a",
          assetNameId: "asset-a",
          assetSubcategoryId: "subcategory-a",
          assetType: "NON_CONSUMABLE",
        },
        "item-a"
      )
    ).toBeNull()
  })
})
