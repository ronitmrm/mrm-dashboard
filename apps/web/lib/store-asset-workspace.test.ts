import { describe, expect, test } from "vitest"

import { storeAssetWorkspaceHref } from "./store-asset-workspace"

describe("Store asset workspace navigation", () => {
  test("opens shared Asset Codes and individual Unit IDs at the same workspace route", () => {
    expect(storeAssetWorkspaceHref("NC001")).toBe("/store/assets/NC001")
    expect(storeAssetWorkspaceHref("NC001-0001")).toBe(
      "/store/assets/NC001-0001"
    )
  })

  test("safely encodes codes used in route segments", () => {
    expect(storeAssetWorkspaceHref("NC 001/BLUE")).toBe(
      "/store/assets/NC%20001%2FBLUE"
    )
  })
})
