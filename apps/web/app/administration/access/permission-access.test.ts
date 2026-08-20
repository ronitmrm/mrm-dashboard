import { describe, expect, it } from "vitest"

import {
  permissionAccessRows,
  permissionKeysForSelections,
} from "./permission-access"

const permissions = [
  {
    key: "pricing.customers.read",
    module: "pricing",
    name: "View customers",
  },
  {
    key: "pricing.customers.write",
    module: "pricing",
    name: "Manage customers",
  },
  {
    key: "pricing.assemblies.read",
    module: "pricing",
    name: "View assemblies and BOM",
  },
  {
    key: "pricing.assemblies.write",
    module: "pricing",
    name: "Manage assemblies and BOM",
  },
  {
    key: "store.stock.read",
    module: "store",
    name: "View Store stock",
  },
  {
    key: "store.asset_history.read",
    module: "store",
    name: "View asset movement and maintenance history",
  },
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
  {
    key: "quality.inspections.read",
    module: "quality",
    name: "View inspections",
  },
  {
    key: "quality.inspections.write",
    module: "quality",
    name: "Manage inspections",
  },
] as const

describe("permission access table", () => {
  it("uses actual pages instead of combining several pages by a legacy stem", () => {
    const rows = permissionAccessRows(permissions)

    expect(rows).toContainEqual({
      fullPermissionKeys: ["pricing.customers.read", "pricing.customers.write"],
      href: "/commercial/customers",
      id: "page:commercial.customers",
      kind: "page",
      label: "Customers",
      module: "Master Data",
      readPermissionKeys: ["pricing.customers.read"],
      supportedLevels: ["none", "read", "full"],
    })
    expect(rows).toContainEqual({
      fullPermissionKeys: [
        "pricing.assemblies.read",
        "pricing.assemblies.write",
      ],
      href: "/commercial/assemblies",
      id: "page:commercial.assemblies",
      kind: "page",
      label: "Assembly / BOM",
      module: "Commercial",
      readPermissionKeys: ["pricing.assemblies.read"],
      supportedLevels: ["none", "read", "full"],
    })
  })

  it("keeps Stock separate from asset movement and maintenance history", () => {
    const rows = permissionAccessRows(permissions)

    expect(rows.find(({ id }) => id === "page:store.stock")).toMatchObject({
      fullPermissionKeys: ["store.stock.read"],
      href: "/store/stock",
      label: "Stock",
    })
    expect(
      rows.find(({ id }) => id === "page:store.asset_history")
    ).toMatchObject({
      fullPermissionKeys: ["store.asset_history.read"],
      href: "/store/assets/:assetCode",
      label: "Asset Movement & Maintenance History",
    })
  })

  it("combines matching non-page capabilities into one task row", () => {
    expect(permissionAccessRows(permissions)).toContainEqual({
      fullPermissionKeys: [
        "quality.inspections.read",
        "quality.inspections.write",
      ],
      href: null,
      id: "quality.inspections",
      kind: "task",
      label: "Inspections",
      module: "quality",
      readPermissionKeys: ["quality.inspections.read"],
      supportedLevels: ["none", "read", "full"],
    })
  })

  it("does not offer an access level that the permission model cannot enforce", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "page:commercial.overview")
        ?.supportedLevels
    ).toEqual(["none", "read"])
    expect(rows.find(({ id }) => id === "operations.production")?.supportedLevels)
      .toEqual(["none", "full"])
  })

  it("submits read alone or read and write from the selected level", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "operations.production": "full",
        "page:commercial.overview": "read",
        "page:commercial.customers": "full",
      })
    ).toEqual([
      "operations.production.write",
      "pricing.customers.read",
      "pricing.customers.write",
      "pricing.dashboard.read",
    ])
  })
})
