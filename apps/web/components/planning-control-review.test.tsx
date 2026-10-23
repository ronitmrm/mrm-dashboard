import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, expect, test, vi } from "vitest"

const feeds = vi.hoisted(() => ({ materialError: null as string | null }))
afterEach(() => { feeds.materialError = null })

vi.mock("@/lib/date-time", () => import("../lib/date-time"))
vi.mock("@/components/ui/golden-patterns", () => import("./ui/golden-patterns"))
vi.mock("@/hooks/use-conditional-records", () => ({
  useConditionalRecords: (url: string) => ({
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

test("combines RM, session and workflow flags with their actions in one filterable table", () => {
  const markup = renderToStaticMarkup(<PlanningControlReview
    floor="cnc"
    reworkRows={[{ jcNo: "P1200/RW1", originalJobCardNumber: "P1200", partCode: "PART", orderPcs: 20, receivedOn: "2026-10-19" }]}
    workflowRows={[{ machine: "CNC-12", jcNo: "P2266", partCode: "M2164B", optionNumber: "2",
      setupNo: "1", rawRows: 2, rawOutputQty: 100, rawActualQty: 95 }]}
    onClose={async () => {}}
    onResolve={async () => {}}
    onAcceptMaterial={async () => {}}
  />)
  expect(markup.match(/<table\b/g)).toHaveLength(1)
  expect(markup).toContain("Flag Type")
  expect(markup).toContain("RM status")
  expect(markup).toContain("Required: 100 kg")
  expect(markup).toContain("Pending: 60 kg")
  expect(markup).toContain("Accept short RM")
  expect(markup).toContain("Material flow conflict")
  expect(markup).toContain("Setup 1 is Item Complete, but Setup 2 was released awaiting material.")
  expect(markup).toContain("Upstream good: 100 · Setup processed: 40")
  expect(markup).toContain("Review production counts. Reopen the upstream setup if unfinished work remains.")
  expect(markup).toContain("/dashboard/job-cards/P2267?floor=cnc")
  expect(markup).toContain("/dashboard/production-sessions?floor=cnc&amp;session=flow-session-1")
  expect(markup).toContain("Review sessions")
  expect(markup).toContain("/?tab=productionControlTab&amp;floor=cnc")
  expect(markup).toContain("Planner Actions")
  expect(markup).toContain("Revision — Route Selection Required")
  expect(markup).toContain("Select route in Part Readiness")
  expect(markup).not.toContain("Floor material wait")
  expect(markup).not.toContain("Working wait:")
  expect(markup).not.toContain("P1201")
  expect(markup).toContain("/dashboard/job-cards/P1200?floor=cnc")
  expect(markup).toContain("Session flag")
  expect(markup).toContain("Workflow exception")
  expect(markup).toContain("Close flag")
  expect(markup).toContain("Resolve workflow")
  expect(markup).toContain("session=session-1")
  expect(markup).toContain("P2266")
})

test("keeps session flags available when RM status cannot be loaded", () => {
  feeds.materialError = "Receipt review unavailable"
  const markup = renderToStaticMarkup(<PlanningControlReview floor="cnc" workflowRows={[]}
    onClose={async () => {}} onResolve={async () => {}} onAcceptMaterial={async () => {}} />)
  expect(markup).toContain("RM status: Receipt review unavailable")
  expect(markup).toContain("Session flag")
  expect(markup).toContain("Close flag")
  expect(markup).not.toContain("No open planning reviews")
})
