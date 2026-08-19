import { describe, expect, it } from "vitest"

import { safeReturnPath } from "./navigation"

describe("safeReturnPath", () => {
  it("keeps local application paths", () => {
    expect(safeReturnPath("/commercial/customers")).toBe(
      "/commercial/customers"
    )
  })

  it("rejects absolute and protocol-relative redirects", () => {
    expect(safeReturnPath("https://attacker.test")).toBe("/home")
    expect(safeReturnPath("//attacker.test")).toBe("/home")
  })

  it("opens the personal dashboard when sign-in has no requested page", () => {
    expect(safeReturnPath(undefined)).toBe("/home")
  })
})
