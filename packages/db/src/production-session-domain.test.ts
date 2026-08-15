import { describe, expect, test } from "vitest"

import {
  calculateProductionSessionOutput,
  formatProductionSessionReference,
  productionShiftAt,
  suggestedCounterStart,
} from "./production-session-domain"

describe("production session output", () => {
  test("calculates good pieces from weight after crate tare and QC rejection", () => {
    expect(
      calculateProductionSessionOutput({
        crateCount: 2,
        crateWeightKg: 1.1,
        grossWeightKg: 100,
        measurementMethod: "weight",
        pieceWeightGrams: 489,
        rejectedPieces: 3,
      })
    ).toEqual({
      goodPieces: 197,
      netWeightKg: 97.8,
      rejectedPieces: 3,
      totalPieces: 200,
    })
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
