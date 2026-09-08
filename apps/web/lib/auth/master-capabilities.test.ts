import { describe, expect, it } from "vitest"

import {
  masterPermissionKey,
  masterPermissionOptions,
  previousMasterCapabilities,
  scopedMasters,
  supportedMasterActions,
} from "./master-capabilities"
import { masterRecordCapability } from "./master-record-access"
import { productionMasterSnapshot } from "./production-master-access"
import { mergeDashboardStateResponse } from "../dashboard-view-model"
import { selectedStoreMasterData } from "./store-master-access"

describe("independent master permissions", () => {
  it("does not turn checklist execution access into master definition access", () => {
    const migratedFrom = (oldKey: string) => scopedMasters.flatMap((master) =>
      supportedMasterActions(master).filter((action) => previousMasterCapabilities(master, action).includes(oldKey)).map((action) => masterPermissionKey(master.unit, master.master, action))
    )
    expect(migratedFrom("quality.setup_checklist.write")).toEqual([])
    expect(migratedFrom("quality.parameters.manage")).toContain("masters.universal.setup_checklist_master.save")
    expect(migratedFrom("quality.parameters.manage")).toContain("masters.universal.setup_checklist_master.import")
  })
  it("preserves maintenance checklist labels and inactive status for the selected master form", () => {
    const checklist = { checklistCode: "PM-1", checklistTitle: "Cleaning", sequence: 1, stepDescription: "Clean filters", inputType: "checkbox", status: "Inactive", required: "Yes" }
    const view = productionMasterSnapshot({ productionControl: { maintenanceChecklistMasterRows: [{ ...checklist, internalNote: "private" }] } }, new Set(["masters.universal.maintenance_master.read", "masters.universal.maintenance_master.save"]), "cnc")
    expect(view.productionControl.maintenanceChecklistMasterRows).toEqual([checklist])
  })
  it("uses the stored record's unit and commercial term type for lifecycle authorization", () => {
    expect(
      masterRecordCapability(
        { kind: "tooling", productionFloorCode: "forging", termType: null },
        "delete"
      )
    ).toBe("masters.forging.tooling.delete")
    expect(
      masterRecordCapability(
        {
          kind: "commercial_commercial_term",
          productionFloorCode: null,
          termType: "payment_terms",
        },
        "rename"
      )
    ).toBe("masters.universal.payment_terms.rename")
    expect(() =>
      masterRecordCapability(
        { kind: "tooling", productionFloorCode: null, termType: null },
        "delete"
      )
    ).toThrow()
  })

  it("returns only the selected master's records, with minimal reference options for an editor", () => {
    const source = {
      readModelVersion: 7,
      dataEntry: {
        rows: [
          { entryType: "tooling", fixture: "F1" },
          { entryType: "cycle", cycleTime: 90 },
        ],
      },
      productionControl: {
        toolingMasterRows: [{ fixture: "F1" }],
        routeMasterRows: [
          {
            partNo: "P1",
            setupNo: "S1",
            setupName: "TURN",
            internalNote: "private",
          },
        ],
        workOrders: [{ customer: "private" }],
      },
      revenue: 100,
    }
    const view = productionMasterSnapshot(
      source,
      new Set(["masters.cnc.tooling.read"]),
      "cnc"
    )
    expect(view.productionControl).toEqual({
      toolingMasterRows: [{ fixture: "F1" }],
    })
    expect(view.dataEntry.rows).toEqual([
      { entryType: "tooling", fixture: "F1" },
    ])
    expect(view).not.toHaveProperty("revenue")
    expect(() =>
      mergeDashboardStateResponse(
        undefined,
        { dashboard: view, productionFloorCode: "cnc", version: 7 },
        "cnc"
      )
    ).not.toThrow()
    const edit = productionMasterSnapshot(
      source,
      new Set(["masters.cnc.tooling.read", "masters.cnc.tooling.save"]),
      "cnc"
    )
    expect(edit.productionControl.routeMasterRows).toEqual([
      { partNo: "P1", setupNo: "S1", setupName: "TURN" },
    ])
    expect(edit.productionControl).not.toHaveProperty("workOrders")
  })
  it("keeps supplier contact details out of a category page and a price form's reference list", () => {
    const data = {
      items: [],
      itemDrawings: [],
      locations: [],
      masters: {
        categories: [{ id: "category", name: "Tools" }],
        subcategories: [],
        assetNames: [],
      },
      portfolioProducts: [],
      suppliers: [
        {
          id: "supplier",
          code: "S1",
          name: "Supplier",
          address: "private",
          contactDetails: "private",
          email: "private@example.test",
          gstNumber: "private",
        },
      ],
      supplierPrices: [],
      vendors: [],
    }
    expect(selectedStoreMasterData(data, "CATEGORY", true).suppliers).toEqual(
      []
    )
    expect(
      selectedStoreMasterData(data, "CATEGORY", true).masters.categories
    ).toEqual(data.masters.categories)
    expect(
      selectedStoreMasterData(data, "SUPPLIER_PRICE", true).suppliers
    ).toEqual([
      {
        id: "supplier",
        code: "S1",
        name: "Supplier",
        address: null,
        contactDetails: null,
        email: null,
        gstNumber: null,
      },
    ])
    expect(
      selectedStoreMasterData(data, "SUPPLIER_PRICE", false).suppliers
    ).toEqual([])
  })
  it("keeps unit grants separate and shared checklists Universal", () => {
    expect(scopedMasters).toHaveLength(69)
    expect(
      scopedMasters
        .filter(({ master }) => master === "setup_checklist_master")
        .map(({ unit }) => unit)
    ).toEqual(["universal"])
    expect(masterPermissionKey("cnc", "tooling", "read")).not.toBe(
      masterPermissionKey("forging", "tooling", "read")
    )
    expect(new Set(masterPermissionOptions.map(({ key }) => key)).size).toBe(
      masterPermissionOptions.length
    )
  })

  it("preserves separate customer create/update actions and omits unsupported material-rate lifecycle actions", () => {
    const customer = scopedMasters.find(
      ({ master }) => master === "commercial_customers"
    )!
    expect(supportedMasterActions(customer)).toEqual([
      "read",
      "create",
      "update",
      "import",
    ])
    const rate = scopedMasters.find(({ master }) => master === "materialRate")!
    expect(supportedMasterActions(rate)).toEqual([
      "read",
      "save",
      "import",
      "delete",
    ])
  })
})
