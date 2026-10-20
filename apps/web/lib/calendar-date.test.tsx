import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { Input } from "@workspace/ui/components/input"
import { formatCalendarDate, parseCalendarDateInput } from "@workspace/ui/lib/calendar-date"
import { calendarInputTemplate, editCalendarInput } from "@workspace/ui/lib/calendar-input"
import { formatIstDate, formatIstDateTime, istDateTimeInputToIso } from "./date-time"

test("shows calendar dates consistently while keeping submitted dates and timestamps canonical", () => {
  expect(formatCalendarDate("18-Jun-26")).toBe("18/06/2026")
  expect(formatCalendarDate("15-Sept-26")).toBe("15/09/2026")
  expect(formatCalendarDate("10/11/26")).toBe("10/11/2026")
  expect(formatCalendarDate("10/17/26")).toBe("17/10/2026")
  expect(parseCalendarDateInput("29/02/2024")).toBe("2024-02-29")
  expect(formatIstDate("2026-10-19")).toBe("19/10/2026")
  expect(formatIstDateTime("2026-10-19T20:00:00Z")).toBe("20/10/2026, 01:30")
  expect(istDateTimeInputToIso("2026-10-19T20:20")).toBe("2026-10-19T14:50:00.000Z")
  const markup = renderToStaticMarkup(<Input type="date" name="received_on" defaultValue="2026-10-19" required />)
  expect(markup).toContain('value="19/10/2026"')
  expect(markup).toContain('name="received_on" value="2026-10-19"')
  const template = calendarInputTemplate(false)
  let edit = { text: template, caret: 0 }
  for (const digit of "17102026") {
    edit = editCalendarInput(edit.text, edit.text.slice(0, edit.caret) + digit + edit.text.slice(edit.caret), edit.caret + 1, template)
  }
  expect(edit.text).toBe("17/10/2026")
  expect(renderToStaticMarkup(<Input type="date" />)).toContain('value="DD/MM/YYYY"')
})

test("rejects another date format or an impossible calendar day", () => {
  expect(parseCalendarDateInput("2026-10-19")).toBeNull()
  expect(parseCalendarDateInput("19/10/26")).toBeNull()
  expect(parseCalendarDateInput("10/17/26")).toBeNull()
  expect(parseCalendarDateInput("1/10/2026")).toBeNull()
  expect(parseCalendarDateInput("29/02/2026")).toBeNull()
  expect(istDateTimeInputToIso("2026-02-30T20:20")).toBe("")
  expect(formatCalendarDate("31/02/2026")).toBe("31/02/2026")
})
