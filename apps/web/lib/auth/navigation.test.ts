import { describe, expect, it } from "vitest"

import { safeReturnPath } from "./navigation"

describe("safeReturnPath", () => {
  it("keeps local application paths", () => {
    expect(safeReturnPath("/commercial/customers")).toBe(
      "/commercial/customers"
    )
  })

  it("rejects absolute and protocol-relative redirects", () => {
    expect(safeReturnPath("https://attacker.test")).toBe("/commercial")
    expect(safeReturnPath("//attacker.test")).toBe("/commercial")
  })
})
