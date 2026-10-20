import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/app/hr/actions", () => ({ generateEmploymentLetterAction: vi.fn() }))
vi.mock(
  "@/components/ui/golden-patterns",
  () => import("../ui/golden-patterns")
)

import { EmployeeLetterForm } from "./employee-letter-dialog"

test("carries the saved probation date into the letter form and returns to HR Tasks", () => {
  const html = renderToStaticMarkup(
    <EmployeeLetterForm
      post={{
        id: "current-post",
        employeeName: "Test Employee",
        employeeCode: "100",
        designation: "Assistant",
      }}
      probationCompletedOn="2026-10-08"
      returnPanel="probationRemindersPanel"
      type="appointment"
    />
  )

  expect(html).toContain('name="panel" value="probationRemindersPanel"')
  expect(html).toContain('name="post_id" value="current-post"')
  expect(html).toMatch(/name="probation_completed_on"[^>]*value="2026-10-08"/)
  expect(html).toContain('name="postal_address"')
  expect(html).toContain('name="probation_length"')
  expect(html).toContain('name="probation_unit"')
  expect(html).toContain('name="duty_start_time"')
  expect(html).toContain('name="duty_end_time"')
  expect(html).toMatch(/name="minimum_weekly_hours"[^>]*value="60"/)
  expect(html).toContain("Generate And Store Letter")
})
