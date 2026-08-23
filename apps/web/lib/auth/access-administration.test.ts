import { describe, expect, it } from "vitest"

import { normalizeApplicationRoleKey } from "./access-administration"

describe("application role keys", () => {
  it("turns a user-facing role label into a safe key without changing existing valid keys", () => {
    expect(normalizeApplicationRoleKey("HR & Recruitment")).toBe(
      "hr-recruitment"
    )
    expect(normalizeApplicationRoleKey(" Sales & Marketing ")).toBe(
      "sales-marketing"
    )
    expect(normalizeApplicationRoleKey("sales")).toBe("sales")
  })

  it("still rejects a key that cannot start with a letter", () => {
    expect(() => normalizeApplicationRoleKey("123")).toThrow(
      "Role keys must start with a letter"
    )
  })
})
