import { expect, it } from "vitest"
import { buildLegacyDashboardSnapshot } from "@workspace/db/dashboard-analysis"
import { compatibleDestinationMachineOptions } from "./machine-constraint-review"
import { proposalContext } from "./order-acceptance-context"

it("uses only the dedicated family across planning, switches and proposal capacity", () => {
  const machineRows = [
    { machineNo: "ACE-01", machineFamily: "T25", machineType: "CNC", status: "Active" },
    { machineNo: "ACE-02", "MACHINE FAMILY": "T25", machineType: "CNC", status: "Active" },
    { machineNo: "T2501", machineFamily: "T26", machineType: "CNC", status: "Active" },
    { machineNo: "T2502", machineType: "CNC", status: "Active" },
  ]
  const snapshot = buildLegacyDashboardSnapshot({
    workbookName: "PostgreSQL",
    productionEntries: [],
    dataEntries: [
      { entryType: "work_order", payload: { jcNo: "JC-CNC", partCode: "P1", optionNumber: "1", orderPcs: 100, rmInwardDate: "2026-09-15" } },
      { entryType: "route", payload: { partNo: "P1", optionNumber: "1", setupNo: "1", machineFamily: "T25", machineType: "CNC" } },
      { entryType: "cycle", payload: { partNo: "P1", optionNumber: "1", setupNo: "1", cycleTime: 60, loadingUnloading: 0 } },
      { entryType: "tooling", payload: { partNo: "P1", optionNumber: "1", setupNo: "1", machineUsed: "T25", tooling: "G1" } },
      ...machineRows.map((payload) => ({ entryType: "machine_master", payload })),
    ].map((entry) => ({ ...entry, createdAt: "2026-09-15T00:00:00.000Z" })),
  })
  const planned = snapshot.productionControl.machinePlanDetailRows
  expect(planned.length).toBeGreaterThan(0)
  expect(planned.every((row) => ["ACE-01", "ACE-02"].includes(String(row.machine)))).toBe(true)
  expect(compatibleDestinationMachineOptions({
    affectedRows: [{ routeMachine: "T25", machineType: "CNC" }],
    machineRows,
    sourceMachine: "ACE-01",
  })).toEqual(["ACE-02"])
  expect(proposalContext(snapshot).context.machines).toEqual([
    { id: "ACE-01", family: "T25" },
    { id: "ACE-02", family: "T25" },
  ])
})
