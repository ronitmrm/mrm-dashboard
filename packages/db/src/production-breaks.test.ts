import { expect, test } from "vitest"

import { productionBreakMinutes, validateProductionBreaks } from "./production-breaks"

test("deducts only break overlap, without counting recorded downtime twice", () => {
  const breaks = validateProductionBreaks([
    { startTime: "10:30", endTime: "10:45" },
    { startTime: "16:30", endTime: "16:45" },
    { startTime: "02:00", endTime: "02:15" },
  ])
  const at = (time: string) => new Date(`2026-09-24T${time}:00+05:30`)
  expect(productionBreakMinutes({ breaks, downtime: [], startedAt: at("06:00"), endedAt: at("08:00") }))
    .toEqual({ breakMinutes: 0, additionalBreakMinutes: 0 })
  expect(productionBreakMinutes({ breaks, downtime: [], startedAt: at("06:00"), endedAt: at("13:00") }))
    .toEqual({ breakMinutes: 15, additionalBreakMinutes: 15 })
  expect(productionBreakMinutes({
    breaks,
    downtime: [],
    startedAt: at("23:00"),
    endedAt: new Date("2026-09-25T03:00:00+05:30"),
  })).toEqual({ breakMinutes: 15, additionalBreakMinutes: 15 })
  expect(productionBreakMinutes({
    breaks,
    downtime: [{ startedAt: at("10:35"), endedAt: at("10:40") }],
    startedAt: at("06:00"),
    endedAt: at("13:00"),
  })).toEqual({ breakMinutes: 15, additionalBreakMinutes: 10 })
})

test("rejects overlapping break master rows", () => {
  expect(() => validateProductionBreaks([
    { startTime: "10:30", endTime: "10:45" },
    { startTime: "10:40", endTime: "11:00" },
  ])).toThrow("Break times cannot overlap")
})
