import { describe, expect, it } from "vitest"

import {
  permissionAccessRows,
  permissionKeysForSelections,
  permissionSelectionsForKeys,
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
    key: "pricing.customers.create",
    module: "pricing",
    name: "Create Customer",
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
    key: "planning.planner_actions.read",
    module: "planning",
    name: "View Planner Actions",
  },
  {
    key: "hr.interview_schedule.read",
    module: "hr",
    name: "View Interview Schedule",
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
      fullPermissionKeys: ["pricing.customers.read"],
      href: "/commercial/customers",
      id: "page:commercial.customers",
      kind: "page",
      label: "Customers",
      module: "Master Data",
      readPermissionKeys: ["pricing.customers.read"],
      supportedLevels: ["none", "read"],
    })
    expect(rows).toContainEqual({
      fullPermissionKeys: ["pricing.assemblies.read"],
      href: "/commercial/assemblies",
      id: "page:commercial.assemblies",
      kind: "page",
      label: "Assembly / BOM",
      module: "Commercial",
      readPermissionKeys: ["pricing.assemblies.read"],
      supportedLevels: ["none", "read"],
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

  it("lists Production and HR workspaces as independent pages", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "page:production.productionControlTab")
    ).toMatchObject({ label: "Planner Actions", module: "Production" })
    expect(
      rows.find(({ id }) => id === "page:hr.interviewsPanel")
    ).toMatchObject({ label: "Interview Schedule", module: "HR & Recruitment" })
  })

  it("lists independently assignable business commands as Task rows", () => {
    expect(permissionAccessRows(permissions)).toContainEqual({
      fullPermissionKeys: ["pricing.customers.create"],
      href: null,
      id: "pricing.customers.create",
      kind: "task",
      label: "Create Customer",
      module: "pricing",
      readPermissionKeys: [],
      supportedLevels: ["none", "full"],
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
      rows.find(({ id }) => id === "page:commercial.overview")?.supportedLevels
    ).toEqual(["none", "read"])
    expect(
      rows.find(({ id }) => id === "operations.production")?.supportedLevels
    ).toEqual(["none", "full"])
  })

  it("submits read alone or read and write from the selected level", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "operations.production": "full",
        "page:commercial.overview": "read",
        "page:commercial.customers": "read",
        "pricing.customers.create": "full",
      })
    ).toEqual([
      "operations.production.write",
      "pricing.customers.create",
      "pricing.customers.read",
      "pricing.dashboard.read",
    ])
  })

  it("loads an existing role into the same read-only/full-access table", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      permissionSelectionsForKeys(rows, [
        "pricing.customers.read",
        "pricing.customers.write",
        "store.stock.read",
      ])
    ).toMatchObject({
      "page:commercial.customers": "read",
      "page:store.stock": "read",
    })
  })

  it("keeps the legacy dashboard read gate behind any Production page", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "page:production.productionControlTab": "read",
      })
    ).toEqual(["operations.dashboard.read", "planning.planner_actions.read"])
  })

  it("keeps the legacy recruitment read gate behind any HR recruitment page", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "page:hr.interviewsPanel": "read",
      })
    ).toEqual(["hr.interview_schedule.read", "hr.recruitment.read"])
  })
})
