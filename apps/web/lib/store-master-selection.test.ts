import { describe, expect, it } from "vitest"

import { storeMasterShowsCode } from "./store-master-selection"

describe("Store master table columns", () => {
  it("shows codes only for masters that own a business code", () => {
    expect(storeMasterShowsCode("CATEGORY")).toBe(false)
    expect(storeMasterShowsCode("SUBCATEGORY")).toBe(false)
    expect(storeMasterShowsCode("ASSET_NAME")).toBe(false)
    expect(storeMasterShowsCode("ITEM_TYPE")).toBe(true)
    expect(storeMasterShowsCode("LOCATION")).toBe(true)
  })
})
