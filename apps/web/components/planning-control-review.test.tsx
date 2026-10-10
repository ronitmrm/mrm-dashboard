import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/lib/date-time", () => import("../lib/date-time"))
vi.mock("@/hooks/use-conditional-records", () => ({
  useConditionalRecords: () => ({
    loading: false, error: null, refresh: vi.fn(),
    data: { rows: [{
      id: "session-1", sessionReference: "CNC-9-20261010-01", productionDate: "2026-10-10",
      machineNumber: "CNC-9", jobCardNumber: "P2046", partCode: "M2164B", optionNumber: "2",
      setupNumber: "1", operatorCode: "42", operatorName: "Worker One", shift: "A",
      totalPieces: 110, targetPieces: 100,
    }] },
  }),
}))

import { PlanningControlReview } from "./planning-control-review"

test("shows session flags and workflow exceptions with their actions in one typed table", () => {
  const markup = renderToStaticMarkup(<PlanningControlReview
    floor="cnc"
    workflowRows={[{ machine: "CNC-12", jcNo: "P2266", partCode: "M2164B", optionNumber: "2",
      setupNo: "1", rawRows: 2, rawOutputQty: 100, rawActualQty: 95 }]}
    onClose={async () => {}}
    onResolve={async () => {}}
  />)
  expect(markup.match(/<table\b/g)).toHaveLength(1)
  expect(markup).toContain("Type")
  expect(markup).toContain("Session flag")
  expect(markup).toContain("Workflow exception")
  expect(markup).toContain("Close flag")
  expect(markup).toContain("Resolve workflow")
  expect(markup).toContain("session=session-1")
  expect(markup).toContain("P2266")
})
