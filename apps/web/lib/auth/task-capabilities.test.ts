import { describe, expect, it } from "vitest"

import {
  administrationTaskCapabilities,
  commercialTaskCapabilities,
  hrTaskCapabilities,
  taskCapabilityCatalog,
} from "./task-capabilities"

describe("button and function capability catalog", () => {
  it("keeps every business command independently assignable", () => {
    const keys = Object.values(taskCapabilityCatalog)
    expect(new Set(keys).size).toBe(keys.length)
    expect(Object.keys(administrationTaskCapabilities)).toHaveLength(9)
    expect(Object.keys(commercialTaskCapabilities)).toHaveLength(53)
    expect(Object.keys(hrTaskCapabilities)).toHaveLength(23)
  })

  it("uses task keys rather than legacy page-write keys", () => {
    expect(Object.values(taskCapabilityCatalog)).not.toContain(
      "pricing.purchase_orders.write"
    )
    expect(Object.values(taskCapabilityCatalog)).not.toContain(
      "hr.recruitment.write"
    )
    expect(Object.values(taskCapabilityCatalog)).not.toContain(
      "administration.roles.manage"
    )
  })
})
