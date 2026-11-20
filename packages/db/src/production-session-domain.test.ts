import { describe, expect, test } from "vitest"

import {
  assertProductionSessionCanClose,
  calculateProductionSessionOutput,
  formatProductionSessionReference,
  productionDowntimeEndOutcome,
  productionSessionEfficiency,
  productionSessionOperationalStatus,
  productionSessionShiftTarget,
  productionShiftAt,
  suggestedCounterStart,
} from "./production-session-domain"

describe("production downtime lifecycle", () => {
  test("blocks session closure until its open downtime is explicitly closed", () => {
    expect(() =>
      assertProductionSessionCanClose({ hasOpenDowntime: true })
    ).toThrow("Close the open downtime before ending the production session.")

    expect(() =>
      assertProductionSessionCanClose({ hasOpenDowntime: false })
    ).not.toThrow()
  })

  test("accepts only resolved or shift-ended-unresolved outcomes", () => {
    expect(productionDowntimeEndOutcome("resolved")).toBe("resolved")
    expect(productionDowntimeEndOutcome("shift_end_unresolved")).toBe(
      "shift_end_unresolved"
    )
    expect(() => productionDowntimeEndOutcome("automatic")).toThrow(
      "A valid downtime closure outcome is required."
    )
  })
})

describe("production session operational status", () => {
  test("marks an open Conventional session Closing Required at its 20:00 shift end", () => {
    const session = {
      productionDate: "2026-08-16",
      productionFloorCode: "conventional",
      shift: "General",
      status: "open" as const,
    }

    expect(
      productionSessionOperationalStatus(
        session,
        new Date("2026-08-16T14:29:59.999Z")
      )
    ).toBe("open")
    expect(
      productionSessionOperationalStatus(
        session,
        new Date("2026-08-16T14:30:00.000Z")
      )
    ).toBe("closing_required")
  })
})

test("shows the shift target upfront and deducts only overlapping breaks and downtime", () => {
  const at = (time: string) => new Date(`2026-11-19T${time}:00+05:30`)
  const input = {
    productionDate: "2026-11-19", productionFloorCode: "cnc", shift: "A",
    startedAt: at("06:00"), cycleTimeSeconds: 60, breaks: [], downtime: [],
  }
  expect(productionSessionShiftTarget(input).targetPieces).toBe(480)
  const late = { ...input, startedAt: at("10:00"), breaks: [{ startTime: "12:00", endTime: "12:30" }] }
  expect(productionSessionShiftTarget(late).targetPieces).toBe(210)
  expect(productionSessionShiftTarget({ ...late, downtime: [
    { startedAt: at("10:30"), endedAt: at("10:45") },
  ] }).targetPieces).toBe(195)
  expect(productionSessionShiftTarget({ ...late, downtime: [
    { startedAt: at("11:45"), endedAt: at("12:15") },
    { startedAt: at("12:00"), endedAt: at("12:45") },
  ] }).targetPieces).toBe(180)
  expect(productionSessionShiftTarget({ ...late, downtime: [
    { startedAt: at("13:30"), endedAt: at("16:00") },
  ] }).targetPieces).toBe(180)
  expect(productionSessionShiftTarget({ ...input, shift: "C", startedAt: at("22:00"),
    breaks: [{ startTime: "02:00", endTime: "02:30" }],
  })).toMatchObject({ targetPieces: 450, targetEndAt: "2026-11-20T00:30:00.000Z" })
  expect(productionSessionShiftTarget({ ...input, startedAt: at("14:00") }).targetPieces).toBe(0)
})

describe("production session output", () => {
  test("calculates efficiency from total produced pieces and target quantity", () => {
    expect(
      productionSessionEfficiency({ targetPieces: 100, totalPieces: 85 })
    ).toBe(0.85)
    expect(
      productionSessionEfficiency({ targetPieces: 0, totalPieces: 0 })
    ).toBeNull()
  })

  test("keeps whole-piece weight boundaries and floors fractional pieces after tare", () => {
    const input = {
      crateCount: 1,
      crateWeightKg: 1.1,
      grossWeightKg: 2.94,
      measurementMethod: "weight" as const,
      pieceWeightGrams: 8,
      rejectedPieces: 1,
    }
    expect(calculateProductionSessionOutput(input)).toEqual({
      goodPieces: 229,
      netWeightKg: 1.84,
      rejectedPieces: 1,
      totalPieces: 230,
    })
    expect(calculateProductionSessionOutput({ ...input, grossWeightKg: 2.939 }))
      .toMatchObject({ goodPieces: 228, totalPieces: 229 })
  })

  test("calculates CNC good pieces from the machine counter after QC rejection", () => {
    expect(
      calculateProductionSessionOutput({
        endCount: 10_850,
        measurementMethod: "counter",
        rejectedPieces: 7,
        startCount: 10_000,
      })
    ).toEqual({
      goodPieces: 843,
      netWeightKg: null,
      rejectedPieces: 7,
      totalPieces: 850,
    })
  })

  test("rejects impossible counter and rejection totals", () => {
    expect(() =>
      calculateProductionSessionOutput({
        endCount: 99,
        measurementMethod: "counter",
        rejectedPieces: 0,
        startCount: 100,
      })
    ).toThrow(/end count/i)

    expect(() =>
      calculateProductionSessionOutput({
        endCount: 110,
        measurementMethod: "counter",
        rejectedPieces: 11,
        startCount: 100,
      })
    ).toThrow(/rejected pieces/i)
  })
})

describe("CNC counter continuity", () => {
  const current = {
    jobCardNumber: "JC-44",
    machineNumber: "CNC-07",
    optionNumber: "2",
    partCode: "PART-9",
    setupNumber: "3",
  }

  test("carries the immediately previous end count for the same production context", () => {
    expect(
      suggestedCounterStart(current, {
        ...current,
        endCount: 10_850,
        measurementMethod: "counter",
        status: "closed",
      })
    ).toBe(10_850)
  })

  test("does not carry a count across a setup or measurement-method change", () => {
    expect(
      suggestedCounterStart(current, {
        ...current,
        endCount: 10_850,
        measurementMethod: "counter",
        setupNumber: "4",
        status: "closed",
      })
    ).toBeNull()

    expect(
      suggestedCounterStart(current, {
        ...current,
        endCount: null,
        measurementMethod: "weight",
        status: "closed",
      })
    ).toBeNull()
  })
})

describe("production shift assignment", () => {
  test.each([
    ["2026-08-15T00:30:00.000Z", "A", "2026-08-15"],
    ["2026-08-15T08:30:00.000Z", "B", "2026-08-15"],
    ["2026-08-15T16:30:00.000Z", "C", "2026-08-15"],
    ["2026-08-15T19:30:00.000Z", "C", "2026-08-15"],
  ])(
    "assigns CNC instant %s to shift %s on production date %s",
    (instant, shift, productionDate) => {
      expect(productionShiftAt("cnc", new Date(instant))).toEqual({
        productionDate,
        shift,
      })
    }
  )

  test.each(["conventional", "conventional-02", "forging"])(
    "assigns %s to the General shift during its operating interval",
    (floor) => {
      expect(
        productionShiftAt(floor, new Date("2026-08-15T05:00:00.000Z"))
      ).toEqual({ productionDate: "2026-08-15", shift: "General" })
    }
  )

  test("does not invent a conventional shift outside its configured interval", () => {
    expect(
      productionShiftAt(
        "conventional",
        new Date("2026-08-15T16:00:00.000Z")
      )
    ).toBeNull()
  })
})

test("formats a stable machine/date/daily-sequence session reference", () => {
  expect(
    formatProductionSessionReference({
      dailySequence: 3,
      machineNumber: "c501",
      productionDate: "2026-08-15",
    })
  ).toBe("C501-20260815-03")
})
