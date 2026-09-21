import { describe, expect, it } from "vitest"

import { storePurchaseOrderIssuanceId } from "./store-purchase-order-input"

describe("Store purchase order input", () => {
  it("recovers when the browser submits a blank issuance ID", () => {
    expect(storePurchaseOrderIssuanceId("", () => "generated-id")).toBe(
      "generated-id"
    )
  })
})
