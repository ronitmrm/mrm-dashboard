import { describe, expect, it } from "vitest"

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
})
