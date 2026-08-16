import { describe, expect, it } from "vitest"

import { buildJobCardAnalytics } from "./job-card-workspace"

describe("job card workspace", () => {
  it("summarizes plan versus actual, rejection and downtime patterns", () => {
    expect(
      buildJobCardAnalytics({
        orderedQuantity: 1_000,
        planRows: [
          {
            plannedProductionEndDate: "2026-08-12",
            plannedProductionStartDate: "2026-08-10",
            setupNumber: "1",
          },
          {
            plannedProductionEndDate: "2026-08-14",
            plannedProductionStartDate: "2026-08-13",
            setupNumber: "2",
          },
        ],
        sessions: [
          {
            downtimeMinutes: 60,
            endedAt: "2026-08-15T10:00:00.000Z",
            goodPieces: 380,
            rejectedPieces: 20,
            runtimeMinutes: 600,
            setupNumber: "1",
            startedAt: "2026-08-11T04:00:00.000Z",
            totalPieces: 400,
          },
          {
            downtimeMinutes: 30,
            endedAt: null,
            goodPieces: 200,
            rejectedPieces: 0,
            runtimeMinutes: 300,
            setupNumber: "2",
            startedAt: "2026-08-14T04:00:00.000Z",
            totalPieces: 200,
          },
        ],
        downtimeEvents: [
          { durationMinutes: 45, reasonCode: "D01", reasonName: "Breakdown", setupNumber: "1" },
          { durationMinutes: 15, reasonCode: "D01", reasonName: "Breakdown", setupNumber: "1" },
          { durationMinutes: 30, reasonCode: "D02", reasonName: "Power", setupNumber: "2" },
        ],
      })
    ).toMatchObject({
      actualGoodPieces: 580,
      actualProducedPieces: 600,
      completionPercent: 58,
      downtimeMinutes: 90,
      plannedEndDate: "2026-08-14",
      plannedStartDate: "2026-08-10",
      rejectedPieces: 20,
      rejectionPercent: 3.33,
      runtimeMinutes: 900,
      sessionCount: 2,
      downtimeByReason: [
        { code: "D01", minutes: 60, name: "Breakdown", occurrences: 2 },
        { code: "D02", minutes: 30, name: "Power", occurrences: 1 },
      ],
      downtimeBySetup: [
        { minutes: 60, occurrences: 2, setupNumber: "1" },
        { minutes: 30, occurrences: 1, setupNumber: "2" },
      ],
      setupPerformance: [
        { actualGoodPieces: 380, completionPercent: 38, setupNumber: "1" },
        { actualGoodPieces: 200, completionPercent: 20, setupNumber: "2" },
      ],
    })
  })
})
