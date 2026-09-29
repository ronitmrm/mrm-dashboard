import { describe, expect, it } from "vitest"

import {
  resolveStoreRequestDepartment,
  storeRequestFormPolicy,
} from "./store-request-policy"

describe("Store Request policy", () => {
  it("uses the signed-in account, sole department, and central Store automatically", () => {
    expect(
      storeRequestFormPolicy({
        employeeDepartments: ["Production"],
        isAdministrator: false,
        organizationDepartments: ["Production", "Quality"],
        requesterEmail: "operator@mayankrawmint.com",
        requesterIdentity: { code: "OP-01", name: "Operator One" },
        storeLocation: null,
      })
    ).toEqual({
      departmentLocked: true,
      departmentOptions: ["Production"],
      departmentValue: "Production",
      requestedBy: "OP-01 - Operator One",
      storeLabel: "Main Store",
      submitDisabled: false,
    })
  })

  it("does not guess when the linked employee belongs to multiple departments", () => {
    const policy = storeRequestFormPolicy({
      employeeDepartments: ["Production", "Quality"],
      isAdministrator: false,
      organizationDepartments: ["Production", "Quality", "Store"],
      requesterEmail: "manager@mayankrawmint.com",
      requesterIdentity: { code: "MAN-01", name: "Manager One" },
      storeLocation: { code: "MAIN", name: "Main Store" },
    })

    expect(policy.departmentLocked).toBe(false)
    expect(policy.departmentOptions).toEqual(["Production", "Quality"])
    expect(policy.departmentValue).toBe("")
    expect(resolveStoreRequestDepartment(policy, "Quality")).toBe("Quality")
    expect(() => resolveStoreRequestDepartment(policy, "Store")).toThrow(
      "Select a department assigned to the signed-in user."
    )
  })

  it("lets an unlinked administrator choose a Department Master value", () => {
    const policy = storeRequestFormPolicy({
      employeeDepartments: [],
      isAdministrator: true,
      organizationDepartments: ["Production", "Quality"],
      requesterEmail: "admin@mayankrawmint.com",
      requesterIdentity: { code: "", name: "System Administrator" },
      storeLocation: null,
    })

    expect(policy.departmentOptions).toEqual(["Production", "Quality"])
    expect(policy.requestedBy).toBe("System Administrator")
    expect(policy.submitDisabled).toBe(false)
    expect(resolveStoreRequestDepartment(policy, "Production")).toBe(
      "Production"
    )
  })

  it("blocks an unlinked non-admin account with a clear configuration error", () => {
    const policy = storeRequestFormPolicy({
      employeeDepartments: [],
      isAdministrator: false,
      organizationDepartments: ["Production"],
      requesterEmail: "unlinked@mayankrawmint.com",
      requesterIdentity: { code: "", name: "Unlinked User" },
      storeLocation: null,
    })

    expect(policy.submitDisabled).toBe(true)
    expect(() => resolveStoreRequestDepartment(policy, "Production")).toThrow(
      "Link the signed-in account to Employee Master before requesting Store items."
    )
  })
})
