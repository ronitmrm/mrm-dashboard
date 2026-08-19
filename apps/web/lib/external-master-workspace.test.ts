import { describe, expect, it } from "vitest"

import {
  externalMasterAllMastersHref,
  externalMasterView,
  externalMasterViewHref,
} from "./external-master-workspace"

describe("external master workspace", () => {
  it("defaults invalid or missing views to Data Entry", () => {
    expect(externalMasterView(undefined)).toBe("dataEntry")
    expect(externalMasterView("unexpected")).toBe("dataEntry")
    expect(externalMasterView(["masterTables"])).toBe("dataEntry")
    expect(externalMasterView("masterTables")).toBe("masterTables")
  })

  it("builds view links while preserving the selected master record", () => {
    expect(
      externalMasterViewHref(
        "/commercial/website-products",
        "dataEntry",
        { edit: "profile 12" }
      )
    ).toBe(
      "/commercial/website-products?masterView=dataEntry&edit=profile+12"
    )
    expect(
      externalMasterViewHref(
        "/commercial/customers",
        "masterTables"
      )
    ).toBe("/commercial/customers?masterView=masterTables")
  })

  it("returns to the matching unified Master Data view", () => {
    expect(externalMasterAllMastersHref("dataEntry")).toBe(
      "/?tab=dataEntryTab"
    )
    expect(externalMasterAllMastersHref("masterTables")).toBe(
      "/?tab=masterTablesTab"
    )
  })
})
