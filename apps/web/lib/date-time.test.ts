import { describe, expect, it } from "vitest"

import {
  formatIstDate,
  formatIstDateTime,
  formatIstTime,
  istDateTimeInputToIso,
  istDateTimeInputParts,
  istDateTimeInputValue,
  istDateValue,
} from "./date-time"

describe("IST date and time display", () => {
  it("renders one UTC instant in IST with a 24-hour clock", () => {
    const instant = "2026-08-16T14:35:00.000Z"

    expect(formatIstDateTime(instant)).toBe("16 Aug 2026, 20:05")
    expect(formatIstDate(instant)).toBe("16 Aug 2026")
    expect(formatIstTime(instant)).toBe("20:05")
  })

  it("uses the IST calendar day for inputs and converts entries back to UTC", () => {
    const instant = new Date("2026-08-16T20:00:00.000Z")

    expect(istDateValue(instant)).toBe("2026-08-17")
    expect(istDateTimeInputValue(instant)).toBe("2026-08-17T01:30")
    expect(istDateTimeInputToIso("2026-08-17T01:30")).toBe(
      "2026-08-16T20:00:00.000Z"
    )
  })

  it("exposes a native-date value and an explicit 24-hour time value", () => {
    expect(istDateTimeInputParts("2026-08-16T08:30")).toEqual({
      date: "2026-08-16",
      time: "08:30",
    })
  })
})
