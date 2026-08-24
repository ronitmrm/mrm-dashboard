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
    name: "Pricing Customers Create",
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
    key: "pricing.enquiries.read",
    module: "pricing",
    name: "View enquiries",
  },
  {
    key: "pricing.costing.read",
    module: "pricing",
    name: "View product and quote costing",
  },
  {
    key: "pricing.revisions.read",
    module: "pricing",
    name: "View price revisions and ECNs",
  },
  {
    key: "operations.master_data_entry.read",
    module: "operations",
    name: "View Master Data Entry",
  },
  {
    key: "operations.master_tables.read",
    module: "operations",
    name: "View Master Tables",
  },
  {
    key: "operations.operational_entry.read",
    module: "operations",
    name: "View Operational Entry",
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
  {
    key: "pricing.sales.followups.complete",
    module: "pricing",
    name: "Complete Sales Followups",
  },
  {
    key: "pricing.sales.read",
    module: "pricing",
    name: "View Sales Workflow",
  },
  {
    key: "administration.staff.provision",
    module: "administration",
    name: "Administration Staff Provision",
  },
  {
    key: "maintenance.tasks.write",
    module: "maintenance",
    name: "Complete Maintenance Tasks",
  },
  {
    key: "hr.masters.read",
    module: "hr",
    name: "View HR Masters",
  },
  {
    key: "hr.approved_posts.create",
    module: "hr",
    name: "Hr Approved Posts Create",
  },
  {
    key: "pricing.assemblies.lines.add",
    module: "pricing",
    name: "Pricing Assemblies Lines Add",
  },
  {
    key: "pricing.enquiries.handover",
    module: "pricing",
    name: "Pricing Enquiries Handover",
  },
  {
    key: "hr.combined_roles.create",
    module: "hr",
    name: "Hr Combined Roles Create",
  },
  {
    key: "store.new_item_requests.submit",
    module: "store",
    name: "Store New Item Requests Submit",
  },
  {
    key: "operations.floors.conventional.planner_actions.read",
    module: "operations",
    name: "View PPAC Conventional-01 Planner Actions",
  },
  {
    key: "operations.floors.cnc.planner_actions.read",
    module: "operations",
    name: "View PPAC CNC-01 Planner Actions",
  },
  {
    key: "operations.floors.conventional.planner_actions.planner_priority.write",
    module: "operations",
    name: "Change planner priorities in PPAC Conventional-01",
  },
  {
    key: "operations.floors.cnc.planner_actions.planner_priority.write",
    module: "operations",
    name: "Change planner priorities in PPAC CNC-01",
  },
  {
    key: "planning.priority.write",
    module: "planning",
    name: "Change planner priorities",
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
      submodule: "Master Selection",
      supportedLevels: ["none", "read"],
    })
    expect(rows).toContainEqual({
      fullPermissionKeys: ["pricing.assemblies.read"],
      href: "/commercial/assemblies",
      id: "page:commercial.assemblies",
      kind: "page",
      label: "Assembly / BOM",
      module: "Costing",
      readPermissionKeys: ["pricing.assemblies.read"],
      submodule: "Product Parameter Costing",
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
      submodule: "Stock",
    })
  })

  it("replaces legacy global PPAC pages while keeping HR workspaces", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "page:production.productionControlTab")
    ).toBeUndefined()
    expect(
      rows.find(({ id }) => id === "page:hr.interviewsPanel")
    ).toMatchObject({ label: "Interview Schedule", module: "HR & Recruitment" })
  })

  it("uses the left-sidebar module names instead of internal permission namespaces", () => {
    const rows = permissionAccessRows(permissions)

    expect(rows.find(({ id }) => id === "page:commercial.sales")).toMatchObject(
      {
        label: "Sales",
        module: "Costing",
      }
    )
    expect(
      rows.find(({ id }) => id === "pricing.sales.followups.complete")
    ).toMatchObject({ module: "Costing" })
    expect(
      rows.find(({ id }) => id === "administration.staff.provision")
    ).toMatchObject({
      label: "Provision Staff",
      module: "Access Administration",
      submodule: "Access Administration",
    })
    expect(rows.find(({ id }) => id === "maintenance.tasks")).toMatchObject({
      module: "Mechanical Maintenance",
      submodule: "Mechanical Maintenance",
    })
    expect(rows.map(({ module }) => module)).not.toEqual(
      expect.arrayContaining([
        "administration",
        "Commercial",
        "hr",
        "maintenance",
        "operations",
        "planning",
        "pricing",
        "Production",
        "quality",
        "store",
      ])
    )
  })

  it("places HR master pages and tasks under the Master Data sidebar hierarchy", () => {
    const rows = permissionAccessRows(permissions)

    expect(rows.find(({ id }) => id === "page:hr.mastersPanel")).toMatchObject({
      label: "Masters",
      module: "Master Data",
      submodule: "Master Selection",
    })
    expect(
      rows.find(({ id }) => id === "hr.approved_posts.create")
    ).toMatchObject({
      label: "Save Approved Post",
      module: "Master Data",
      submodule: "Master Selection",
    })
  })

  it("uses the exact visible button label for task access", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "pricing.customers.create")
    ).toMatchObject({ label: "Add Customer" })
    expect(
      rows.find(({ id }) => id === "pricing.assemblies.lines.add")
    ).toMatchObject({ label: "Add Bom Line" })
    expect(
      rows.find(({ id }) => id === "pricing.enquiries.handover")
    ).toMatchObject({ label: "Hand Over To Technical Review" })
    expect(
      rows.find(({ id }) => id === "hr.combined_roles.create")
    ).toMatchObject({ label: "Create Combined Role" })
    expect(
      rows.find(({ id }) => id === "store.new_item_requests.submit")
    ).toMatchObject({ label: "Send New Item Request" })
  })

  it("places enquiry entry and Excel View under their exact sidebar locations", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "page:commercial.enquiries")
    ).toMatchObject({
      module: "Operational Entry",
      submodule: "Entry Selection",
    })
    expect(
      rows.find(({ id }) => id === "page:commercial.enquiry_excel_view")
    ).toMatchObject({
      module: "Costing",
      submodule: "Excel View",
    })
  })

  it("uses exact Master Data and Operational Entry sidebar submodules", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "page:production.dataEntryTab")
    ).toMatchObject({
      label: "Data Entry",
      module: "Master Data",
      submodule: "Master Selection",
    })
    expect(
      rows.find(({ id }) => id === "page:production.masterTablesTab")
    ).toMatchObject({
      label: "Master Table",
      module: "Master Data",
      submodule: "Master Tables",
    })
    expect(
      rows.find(({ id }) => id === "page:production.operationalEntryTab")
    ).toMatchObject({
      label: "Data Entry",
      module: "Operational Entry",
      submodule: "Entry Selection",
    })
    expect(
      rows.find(({ id }) => id === "page:production.operationalTablesTab")
    ).toMatchObject({
      label: "Entry Tables",
      module: "Operational Entry",
      submodule: "Entry Tables",
    })
  })

  it("maps internal commercial pages to exact Costing sidebar workflows", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "page:commercial.customer-costing")
    ).toMatchObject({ submodule: "Customer Parameter Costing" })
    expect(rows.find(({ id }) => id === "page:commercial.ecns")).toMatchObject(
      { submodule: "Engineering Changes" }
    )
    expect(
      rows.find(({ id }) => id === "page:commercial.revisions")
    ).toMatchObject({ submodule: "Product Bulk Revision" })
  })

  it("lists PPAC floor pages under their exact sidebar module and submodule", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(
        ({ id }) => id === "page:production.conventional.productionControlTab"
      )
    ).toMatchObject({
      kind: "page",
      label: "Planner Actions",
      module: "PPAC Conventional-01",
      submodule: "Planner Actions",
    })
    expect(
      rows.find(({ id }) => id === "page:production.cnc.productionControlTab")
    ).toMatchObject({
      kind: "page",
      label: "Planner Actions",
      module: "PPAC CNC-01",
      submodule: "Planner Actions",
    })

    const completeRows = permissionAccessRows([
      ...permissions,
      {
        key: "operations.floors.conventional.machinist_tasks.read",
        module: "operations",
        name: "View PPAC Conventional-01 Machinist",
      },
      {
        key: "operations.floors.conventional.quality_control_tasks.read",
        module: "operations",
        name: "View PPAC Conventional-01 Quality Control",
      },
    ])
    expect(
      completeRows.find(
        ({ id }) => id === "page:production.conventional.machinistTasksTab"
      )
    ).toMatchObject({ label: "Machinist", submodule: "Machinist" })
    expect(
      completeRows.find(
        ({ id }) => id === "page:production.conventional.qualityControlTasksTab"
      )
    ).toMatchObject({ label: "Quality Control", submodule: "Quality Control" })
  })

  it("lists PPAC tasks independently under each floor and submodule", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(
        ({ id }) => id === "task:production.conventional.planner_priority"
      )
    ).toMatchObject({
      fullPermissionKeys: [
        "operations.floors.conventional.planner_actions.planner_priority.write",
        "planning.priority.write",
      ],
      kind: "task",
      label: "Change planner priorities",
      module: "PPAC Conventional-01",
      submodule: "Planner Actions",
    })
    expect(
      rows.find(({ id }) => id === "task:production.cnc.planner_priority")
    ).toMatchObject({
      module: "PPAC CNC-01",
      submodule: "Planner Actions",
    })
    expect(
      rows.find(({ id }) => id === "planning.priority")
    ).toBeUndefined()
  })

  it("submits only the selected floor task plus its legacy server gate", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "task:production.conventional.planner_priority": "full",
      })
    ).toEqual([
      "operations.floors.conventional.planner_actions.planner_priority.write",
      "planning.priority.write",
    ])
  })

  it("lists independently assignable business commands as Task rows", () => {
    expect(permissionAccessRows(permissions)).toContainEqual({
      fullPermissionKeys: ["pricing.customers.create"],
      href: null,
      id: "pricing.customers.create",
      kind: "task",
      label: "Add Customer",
      module: "Master Data",
      readPermissionKeys: [],
      submodule: "Master Selection",
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
      label: "Manage inspections",
      module: "Production Dashboard",
      readPermissionKeys: ["quality.inspections.read"],
      submodule: "Production Dashboard",
      supportedLevels: ["none", "read", "full"],
    })
  })

  it("does not offer an access level that the permission model cannot enforce", () => {
    const rows = permissionAccessRows(permissions)

    expect(
      rows.find(({ id }) => id === "page:commercial.overview")?.supportedLevels
    ).toEqual(["none", "read"])
    expect(
      rows.find(
        ({ id }) => id === "task:production.conventional.planner_priority"
      )?.supportedLevels
    ).toEqual(["none", "full"])
  })

  it("submits read alone or read and write from the selected level", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "task:production.conventional.planner_priority": "full",
        "page:commercial.overview": "read",
        "page:commercial.customers": "read",
        "pricing.customers.create": "full",
      })
    ).toEqual([
      "operations.floors.conventional.planner_actions.planner_priority.write",
      "planning.priority.write",
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
        "page:production.conventional.productionControlTab": "read",
      })
    ).toEqual([
      "operations.dashboard.read",
      "operations.floors.conventional.planner_actions.read",
    ])
  })

  it("keeps the legacy recruitment read gate behind any HR recruitment page", () => {
    expect(
      permissionKeysForSelections(permissionAccessRows(permissions), {
        "page:hr.interviewsPanel": "read",
      })
    ).toEqual(["hr.interview_schedule.read", "hr.recruitment.read"])
  })
})
