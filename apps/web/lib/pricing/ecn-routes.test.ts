import { describe, expect, it } from "vitest"

import {
  ecnDesignHref,
  ecnHref,
  ecnProductOptionLabel,
  ecnStageHref,
} from "./ecn-routes"

describe("ECN routes and product lookup", () => {
  it("opens an ECN on its own page", () => {
    expect(ecnHref("ecn id/1")).toBe("/commercial/ecns/ecn%20id%2F1")
  })

  it("opens pending Design ECNs in the complete Design workspace", () => {
    expect(ecnDesignHref("ecn id/1")).toBe(
      "/commercial/ecns/ecn%20id%2F1/design"
    )
    expect(ecnStageHref("ecn id/1", "Pending Design")).toBe(
      "/commercial/ecns/ecn%20id%2F1/design"
    )
    expect(ecnStageHref("ecn id/1", "Pending Product Costing")).toBe(
      "/commercial/ecns/ecn%20id%2F1"
    )
  })

  it("makes UID, category, subcategory, and name searchable", () => {
    expect(
      ecnProductOptionLabel({
        category: "Adapter",
        description: "Male Flare X Male NPTF Adapter",
        subcategory: "Straight",
        uid: "M1",
      })
    ).toBe("M1 · Adapter · Straight · Male Flare X Male NPTF Adapter")
  })
})
