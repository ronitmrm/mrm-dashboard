import { describe, expect, it } from "vitest"
import { machineTypeForFamily } from "@workspace/db/planning-rules"
import { parseTemplateUpload } from "./template-upload"

import {
  machineFamilyOptions,
  planningMasterPayload,
  routeMasterLineOptions,
  setupNameOptions,
} from "./planning-master-contract"

const routeRows = [
  {
    machineFamily: "D5",
    machineType: "Drilling",
    optionNumber: "1",
    partNo: "P-100",
    setupName: "Cross Hole",
    setupNo: "2",
    stageWeight: "125",
  },
]

describe("planning master contract", () => {
  it("fetches the family's shared machine type and leaves conflicts unresolved", () => {
    const machines = [
      { machineFamily: "D5", machineType: "Drilling" },
      { machineFamily: " d5 ", machineType: "Drilling" },
      { machineFamily: "T1", machineType: "Turning" },
    ]
    expect(machineTypeForFamily(machines, "D5")).toBe("Drilling")
    expect(machineTypeForFamily(machines, "T1")).toBe("Turning")
    expect(machineTypeForFamily(machines, "")).toBe("")
    expect(machineTypeForFamily([...machines, { machineFamily: "D5", machineType: "Turning" }], "D5")).toBe("")
  })
  it("offers route identities and master-backed dropdown values", () => {
    expect(routeMasterLineOptions(routeRows)).toEqual([
      {
        key: "p-100|1|2",
        label: "P-100 · Option 1 · Setup 2 · Cross Hole",
        value: routeRows[0],
      },
    ])
    expect(machineFamilyOptions([{ machineFamily: "D5" }, { machineFamily: " d5 " }]))
      .toEqual(["D5"])
    expect(setupNameOptions([{ setupName: "Cross Hole" }, { setupName: " cross hole " }]))
      .toEqual(["Cross Hole"])
  })

  it("derives every Cycle Time identity field from the selected Route Master line", () => {
    expect(
      planningMasterPayload("cycle", routeRows[0]!, {
        cycleTime: "18.5",
        partNo: "WRONG",
        setupName: "Mistyped",
      })
    ).toEqual({
      cycleTime: "18.5",
      machineFamily: "D5",
      machineType: "Drilling",
      optionNumber: "1",
      partNo: "P-100",
      setupName: "Cross Hole",
      setupNo: "2",
      stageWeight: "125",
    })
  })

  it("derives Tooling identity from Route Master and never accepts quantities", () => {
    expect(
      planningMasterPayload("tooling", routeRows[0]!, {
        fixture: "NC001",
        fixtureQty: "9",
        foamTool: "NC002",
        remarks: "Shared tooling",
        tooling: "",
        toolingQty: "4",
      })
    ).toEqual({
      fixture: "NC001",
      foamTool: "NC002",
      machineFamily: "D5",
      machineType: "Drilling",
      optionNumber: "1",
      partNo: "P-100",
      remarks: "Shared tooling",
      setupName: "Cross Hole",
      setupNo: "2",
      stageWeight: "125",
      tooling: "",
    })
  })

  it("uses kilograms and minutes for a blasting route without a client-derived cycle", () => {
    const route = { ...routeRows[0], machineType: "Blasting Machine" }
    const csv = "Part No.,Option No.,Setup No.,Cycle Time Sec,Batch Weight Kg,Batch Time Minutes\nP-100,1,2,999,100,20\n"
    const [imported] = parseTemplateUpload(
      "cycle", "cycle.csv", Buffer.from(csv).toString("base64"), new Set(["cycle"])
    ).rows
    expect(imported).toMatchObject({ partNo: "P-100", optionNumber: 1, setupNo: 2 })
    expect(planningMasterPayload("cycle", route, imported!)).toEqual({
      ...route,
      batchWeightKg: "100", batchTimeMinutes: "20", cycleBasis: "weight_batch",
    })
  })
})
