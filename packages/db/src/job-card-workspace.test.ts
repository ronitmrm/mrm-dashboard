import { describe, expect, it } from "vitest"

import {
  buildDeliveryPerformance,
  buildJobCardAnalytics,
  buildMaterialYield,
  buildSetupTiming,
  normalizeDeliveryTargets,
} from "./job-card-workspace"

describe("job card workspace", () => {
  it("summarizes plan versus actual, rejection and downtime patterns", () => {
    expect(
      buildJobCardAnalytics({
        finalSetupNumber: "2",
        firstSetupNumber: "1",
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
      actualGoodPieces: 200,
      actualProducedPieces: 200,
      completionPercent: 20,
      downtimeMinutes: 90,
      plannedEndDate: "2026-08-14",
      plannedStartDate: "2026-08-10",
      rejectedPieces: 20,
      rejectionPercent: 3.33,
      runtimeMinutes: 900,
      sessionCount: 2,
      operationGoodPieces: 580,
      operationProducedPieces: 600,
      materialOutputPieces: 400,
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

  it("does not count earlier setup output as finished pieces", () => {
    expect(buildJobCardAnalytics({
      downtimeEvents: [],
      finalSetupNumber: "3",
      firstSetupNumber: "1",
      orderedQuantity: 10_000,
      planRows: [
        { setupNumber: "1" },
        { setupNumber: "2" },
        { setupNumber: "3" },
      ],
      sessions: [{
        goodPieces: 8_441,
        rejectedPieces: 0,
        setupNumber: "1",
        totalPieces: 8_441,
      }],
    })).toMatchObject({
      actualGoodPieces: 0,
      actualProducedPieces: 0,
      completionPercent: 0,
      finalSetupNumber: "3",
      operationGoodPieces: 8_441,
      operationProducedPieces: 8_441,
      materialOutputPieces: 8_441,
    })
  })

  it("uses good production as progress and explains the material shortfall", () => {
    expect(
      buildMaterialYield({
        actualGoodPieces: 40_000,
        actualProducedPieces: 48_000,
        orderedQuantity: 50_000,
        piecesPerKg: 100,
        receivedKg: 520,
        remainingKg: 20,
        rejectedPieces: 8_000,
      })
    ).toEqual({
      available: true,
      expectedPiecesFromMaterial: 52_000,
      materialCapacityShortPieces: 0,
      orderShortPieces: 10_000,
      productionProgressPercent: 80,
      remainingMaterialEquivalentPieces: 2_000,
      rejectedPieces: 8_000,
      unexplainedLossPieces: 2_000,
    })
  })

  it("caps production progress at 100 percent", () => {
    expect(buildJobCardAnalytics({
      downtimeEvents: [],
      finalSetupNumber: "1",
      firstSetupNumber: "1",
      orderedQuantity: 100,
      planRows: [],
      sessions: [{ goodPieces: 120, setupNumber: "1", totalPieces: 120 }],
    }).completionPercent).toBe(100)
  })

  it("does not invent a material shortage when pieces per kilogram is missing", () => {
    expect(buildMaterialYield({
      actualGoodPieces: 100,
      actualProducedPieces: 110,
      orderedQuantity: 1_000,
      piecesPerKg: 0,
      receivedKg: 50,
      rejectedPieces: 10,
      remainingKg: 20,
    })).toEqual({
      available: false,
      expectedPiecesFromMaterial: null,
      materialCapacityShortPieces: null,
      orderShortPieces: 900,
      productionProgressPercent: 10,
      remainingMaterialEquivalentPieces: null,
      rejectedPieces: 10,
      unexplainedLossPieces: null,
    })
  })

  it("separates machinist setup time from QC and machine-start waiting", () => {
    expect(
      buildSetupTiming({
        productionStartedAt: "2026-08-01T11:15:00.000Z",
        qualityApprovedAt: "2026-08-01T11:00:00.000Z",
        settingCompletedAt: "2026-08-01T10:30:00.000Z",
        settingStartedAt: "2026-08-01T08:00:00.000Z",
        targetSetupMinutes: 120,
      })
    ).toEqual({
      machinistSetupMinutes: 150,
      machineStartWaitMinutes: 15,
      qcWaitMinutes: 30,
      setupVarianceMinutes: 30,
      targetSetupMinutes: 120,
    })
  })

  it("rates delivery in working days excluding Fridays and holidays", () => {
    expect(
      buildDeliveryPerformance({
        actualOrProjectedDate: "2026-08-13",
        asOfDate: "2026-08-16",
        holidayDates: ["2026-08-08"],
        rawMaterialCompleteDate: "2026-08-03",
        targetWorkingDays: 5,
      })
    ).toEqual({
      daysLate: 3,
      rating: "C",
      status: "3 working days late",
      targetDate: "2026-08-10",
    })
  })

  it("uses a Job Card delivery override when provided", () => {
    expect(normalizeDeliveryTargets({
      jobCardOverrideWorkingDays: 12,
      productDefaultWorkingDays: 20,
    })).toEqual({
      effectiveWorkingDays: 12,
      jobCardOverrideWorkingDays: 12,
      productDefaultWorkingDays: 20,
      source: "job_card_override",
    })
    expect(() => normalizeDeliveryTargets({
      jobCardOverrideWorkingDays: 0,
      productDefaultWorkingDays: 20,
    })).toThrow("Job Card override must be between 1 and 365 working days.")
  })
})
