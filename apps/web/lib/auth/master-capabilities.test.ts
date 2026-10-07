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
  it("supplies only shared choice labels to unit inspection editors", () => {
    const view = productionMasterSnapshot({ productionControl: {
      parameterMasterRows: [{ name: "Length", status: "Active", internalNote: "private" }],
      measuringInstrumentMasterRows: [{ name: "Caliper", status: "Active" }],
    } }, new Set(["masters.cnc.quality_parameter_master.read", "masters.cnc.quality_parameter_master.save"]), "cnc")
    expect(view.productionControl.parameterMasterRows).toEqual([{ name: "Length", status: "Active" }])
    expect(view.productionControl.measuringInstrumentMasterRows).toEqual([{ name: "Caliper", status: "Active" }])
    expect(view.dataEntry.entryTypes).toEqual(["quality_parameter_master"])
  })
  it("does not turn checklist execution access into master definition access", () => {
    const migratedFrom = (oldKey: string) => scopedMasters.flatMap((master) =>
      supportedMasterActions(master).filter((action) => previousMasterCapabilities(master, action).includes(oldKey)).map((action) => masterPermissionKey(master.unit, master.master, action))
    )
    expect(migratedFrom("quality.setup_checklist.write")).toEqual([])
    expect(migratedFrom("quality.parameters.manage")).toContain("masters.cnc.setup_checklist_master.save")
    expect(migratedFrom("quality.parameters.manage")).toContain("masters.cnc.setup_checklist_master.import")
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
        machinePlanningRows: [{ machineFamily: "D5", machineType: "Drilling", internalNote: "private" }],
        toolingMasterRows: [{ fixture: "F1" }],
        routeMasterRows: [
          {
            partNo: "P1",
            setupNo: "S1",
            setupName: "TURN",
            machineType: "Cnc",
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
      { partNo: "P1", setupNo: "S1", setupName: "TURN", machineType: "Cnc" },
    ])
    expect(edit.productionControl).not.toHaveProperty("workOrders")
    const routeEdit = productionMasterSnapshot(source, new Set([
      "masters.cnc.route.read", "masters.cnc.route.save",
    ]), "cnc")
    expect(routeEdit.productionControl.machinePlanningRows).toEqual([
      { machineFamily: "D5", machineType: "Drilling" },
    ])
  })
  it("keeps supplier price references useful without exposing private item or supplier details", () => {
    const data = {
      items: [{
        id: "item",
        typeCode: "C002",
        assetType: "CONSUMABLE",
        assetCategory: "Cutting Insert",
        assetCategoryId: "category",
        assetSubcategory: "Turning Insert",
        assetSubcategoryId: "subcategory",
        assetName: "VCGT-16 0.8",
        assetNameId: "asset-name",
        makeModel: "Non Specific",
        makeModelId: "make-model",
        identificationName: "",
        modelNumber: "private",
        ratedLoad: "private",
        unit: "No.",
      }],
      itemDrawings: [],
      locations: [],
      masters: {
        categories: [{ id: "category", name: "Tools" }],
        subcategories: [],
        assetNames: [],
        makeModels: [],
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
    const itemReferences = selectedStoreMasterData(data, "SUPPLIER_PRICE", true).items
    expect(itemReferences[0]).toMatchObject({
      assetCategory: "Cutting Insert",
      assetSubcategory: "Turning Insert",
      assetName: "VCGT-16 0.8",
      makeModel: "Non Specific",
    })
    expect(itemReferences[0]?.modelNumber).toBeNull()
    expect(itemReferences[0]?.ratedLoad).toBeNull()
    expect(selectedStoreMasterData(data, "SUPPLIER_PRICE", false).items).toEqual([])
  })
  it("keeps setup checklist grants separate for each unit", () => {
    expect(scopedMasters).toHaveLength(81)
    expect(
      scopedMasters
        .filter(({ master }) => master === "setup_checklist_master")
        .map(({ unit }) => unit)
    ).toEqual(["conventional", "conventional-02", "cnc", "forging"])
    expect(masterPermissionKey("cnc", "tooling", "read")).not.toBe(
      masterPermissionKey("forging", "tooling", "read")
    )
    expect(new Set(masterPermissionOptions.map(({ key }) => key)).size).toBe(
      masterPermissionOptions.length
    )
    expect(supportedMasterActions(scopedMasters.find(
      ({ master, unit }) => master === "production_break_schedule" && unit === "cnc"
    )!)).toEqual(["read", "save"])
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
