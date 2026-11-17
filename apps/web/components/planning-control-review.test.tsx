import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, expect, test, vi } from "vitest"

const feeds = vi.hoisted(() => ({ materialError: null as string | null }))
afterEach(() => { feeds.materialError = null })

vi.mock("@/lib/date-time", () => import("../lib/date-time"))
vi.mock("@/components/ui/golden-patterns", () => import("./ui/golden-patterns"))
vi.mock("@/hooks/use-conditional-records", () => ({
  useConditionalRecords: (url: string) => url.startsWith("/api/planning-control-history") ? ({
    loading: false, error: null, refresh: vi.fn(),
    data: { canEditMachineReasons: true, rows: [{ id: "saved-1", kind: "machine", machine: "CNC-2", productionDate: "2026-11-16",
      shift: "A", completedAt: "2026-11-16T10:00:00.000Z", reason: "operator_unavailable", jobCard: "P2046", part: "M421B", setup: "2" }] },
  }) : ({
    loading: false, error: url.startsWith("/api/raw-material-review") ? feeds.materialError : null, refresh: vi.fn(),
    data: { materialFlowReviews: url.startsWith("/api/raw-material-review") && !feeds.materialError ? [{
      id: "material-flow-1", jobCardNumber: "P2267", partCode: "M2164C", optionNumber: "2",
      setupNumber: 2, machineNumber: "CNC-13", upstreamSetupNumber: 1,
      upstreamGoodPieces: 100, setupProcessedPieces: 40, sessionId: "flow-session-1",
    }] : [], movementWaits: url.startsWith("/api/raw-material-review") && !feeds.materialError ? [{
      id: "wait-1", jobCardNumber: "P1201", partCode: "M101", optionNumber: "1", setupNumber: 2,
      machineNumber: "CNC-12", readyAt: "2026-10-18T03:30:00Z", workingMinutes: 60,
    }] : [], rows: url.startsWith("/api/raw-material-review") ? (feeds.materialError ? [] : [{
      id: "material-1", jobCardNumber: "P1200", partCode: "M100", rowVersion: 1,
      requiredKg: 100, receivedKg: 40, pendingKg: 60, rejectedKg: 0, usableKg: 40, shortAccepted: false,
    }]) : [{
      id: "session-1", sessionReference: "CNC-9-20261010-01", productionDate: "2026-10-10",
      machineNumber: "CNC-9", jobCardNumber: "P2046", partCode: "M2164B", optionNumber: "2",
      setupNumber: "1", operatorCode: "42", operatorName: "Worker One", shift: "A",
      totalPieces: 110, targetPieces: 100,
    }] },
  }),
}))

import { PlanningControlReview } from "./planning-control-review"

const render = (defaultQueue?: string, floor: "cnc" | "forging" = "cnc") => renderToStaticMarkup(<PlanningControlReview
    floor={floor}
    defaultQueue={defaultQueue}
    reworkRows={[{ jcNo: "P1200/RW1", originalJobCardNumber: "P1200", partCode: "PART", orderPcs: 20, receivedOn: "2026-10-19" }]}
    workflowRows={[{ machine: "CNC-12", jcNo: "P2266", partCode: "M2164B", optionNumber: "2",
      setupNo: "1", rawRows: 2, rawOutputQty: 100, rawActualQty: 95 }]}
    onClose={async () => {}}
    onResolve={async () => {}}
    onAcceptMaterial={async () => {}}
/>)

test("opens Machine Review only for CNC Planning Control", () => {
  const markup = render("shift-coverage")
  expect(markup).toContain("Machine Review")
  expect(markup).toContain("Loading machine reviews")
  expect(markup).toContain("Machine review filters")
  expect(markup).toContain("All shifts")
  for (const label of ["Needs review", "Saved reasons", "All machines", "Latest completed shift", "Load older shifts"])
    expect(markup).not.toContain(label)
  expect(markup).not.toContain("Close flag")
  expect(render("shift-coverage", "forging")).not.toContain("Machine Review")
})

test("offers an inline edit for a saved machine reason in Completed", () => {
  const markup = render("completed")
  expect(markup).toContain("Completed planning reviews")
  expect(markup).toContain("Unaccounted time")
  expect(markup).toContain("Unaccounted time filters")
  for (const header of ["Machine Number", "Item Code", "Setup Number", "Job Card Number"])
    expect(markup).toContain(header)
  expect(markup).toContain("/dashboard/job-cards/P2046?floor=cnc")
  expect(markup).toContain("M421B")
  expect(markup).toContain("Operator unavailable")
  expect(markup).toContain("Edit reason")
  expect(markup).not.toContain("review=shift-coverage")
  expect(markup).not.toContain("Close flag")
})

test("shows the production queue and leaves material details in their own tab", () => {
  const markup = render()
  expect(markup.match(/<table\b/g)).toHaveLength(1)
  for (const label of ["Production", "Material", "Dispatch", "Efficiency 110%", "Workflow exception",
    "Close flag", "Resolve workflow", "session=session-1", "P2266"]) expect(markup).toContain(label)
  expect(markup).not.toContain("Accept short RM")
  expect(markup).not.toContain("P1200")
})

test("keeps material, flow conflict and route actions together in the material queue", () => {
  const markup = render("material")
  for (const label of ["Pending 60 kg", "Accept short RM", "Material flow conflict", "Upstream Setup 1 is Item Complete",
    "Review sessions", "session=flow-session-1", "Planner Actions", "Route selection required",
    "/dashboard/job-cards/P1200?floor=cnc"]) expect(markup).toContain(label)
  expect(markup).not.toContain("P1201")
  expect(markup).not.toContain("Close flag")
})

test("keeps session flags available when RM status cannot be loaded", () => {
  feeds.materialError = "Receipt review unavailable"
  const markup = renderToStaticMarkup(<PlanningControlReview floor="cnc" workflowRows={[]}
    onClose={async () => {}} onResolve={async () => {}} onAcceptMaterial={async () => {}} />)
  expect(markup).not.toContain("Receipt review unavailable")
  expect(markup).toContain("Efficiency 110%")
  expect(markup).toContain("Close flag")
  expect(render("material")).toContain("Receipt review unavailable")
})

test("dispatch commitments remain through partial dispatch and clear only on completed dispatch", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-31T20:00:00Z")) // Already 1 November in India.
  try {
    const markup = renderToStaticMarkup(<PlanningControlReview floor="cnc" workflowRows={[]} defaultQueue="dispatch"
      dispatchRows={[
        { jcNo: "D-PARTIAL", partCode: "M1", status: "Partially dispatched", committedDispatchDate: "2026-10-31", dispatchedPieces: 40 },
        { jcNo: "D-TODAY", partCode: "M1", status: "Pending", committedDispatchDate: "2026-11-01" },
        { jcNo: "D-FUTURE", partCode: "M1", status: "Pending", committedDispatchDate: "2026-11-05" },
        { jcNo: "D-SHIPPED", partCode: "M1", status: "Dispatched", committedDispatchDate: "2026-10-31" },
        { jcNo: "D-NO-DATE", partCode: "M1", status: "Pending" },
      ]}
      onClose={async () => {}} onResolve={async () => {}} onAcceptMaterial={async () => {}} />)
    for (const label of ["D-PARTIAL", "D-TODAY", "D-FUTURE", "Overdue", "Due today", "Upcoming", "Dispatched 40 pcs"]) expect(markup).toContain(label)
    expect(markup).not.toContain("D-SHIPPED")
    expect(markup).not.toContain("D-NO-DATE")
  } finally { vi.useRealTimers() }
})
