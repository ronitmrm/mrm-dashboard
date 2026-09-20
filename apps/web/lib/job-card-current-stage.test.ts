import { describe, expect, it } from "vitest"
import { jobCardCurrentStage } from "./job-card-current-stage"

describe("job card current stage", () => {
  it("recognizes imported running production without sessions or receipt records", () => {
    const input = {
      analytics: { orderedQuantity: 1000, actualGoodPieces: 0 },
      sessions: [],
      setupTimings: [],
      selectedRoute: { selected: true },
      receipts: [],
      planRows: [{ partCode: "P2058", runningStatus: "Running" }],
    }
    expect(jobCardCurrentStage(input)).toBe("Production running")
    expect(jobCardCurrentStage({ ...input, planRows: [] })).toBe("Awaiting raw material")
  })
})
