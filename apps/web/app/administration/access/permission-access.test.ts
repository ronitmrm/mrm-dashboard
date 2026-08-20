import { describe, expect, it } from "vitest"

import {
  permissionAccessRows,
  permissionKeysForSelections,
} from "./permission-access"

const permissions = [
  {
    key: "pricing.design.read",
    module: "pricing",
    name: "View design tasks",
  },
  {
    key: "pricing.design.write",
    module: "pricing",
    name: "Manage design tasks",
  },
  {
    key: "pricing.dashboard.read",
    module: "pricing",
    name: "View pricing dashboard",
  },
  {
    key: "operations.production.write",
    module: "operations",
    name: "Record production",
  },
] as const

describe("permission access table", () => {
  it("combines matching read and write capabilities into one task row", () => {
    expect(permissionAccessRows(permissions)).toContainEqual({
      fullPermissionKeys: ["pricing.design.read", "pricing.design.write"],
      id: "pricing.design",
      label: "Design tasks",
      module: "pricing",
      readPermissionKeys: ["pricing.design.read"],
      supportedLevels: ["none", "read", "full"],
    })
  })

  it("does not offer an access level that the permission model cannot enforce", () => {
    const rows = permissionAccessRows(permissions)

    expect(rows.find(({ id }) => id === "pricing.dashboard")?.supportedLevels)
      .toEqual(["none", "read"])
    expect(rows.find(({ id }) => id === "operations.production")?.supportedLevels)
      .toEqual(["none", "full"])
  })

  it("submits read alone or read and write from the selected level", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "operations.production": "full",
        "pricing.dashboard": "read",
        "pricing.design": "full",
      })
    ).toEqual([
      "operations.production.write",
      "pricing.dashboard.read",
      "pricing.design.read",
      "pricing.design.write",
    ])
  })
})
