import { expect, test } from "vitest"
import { hrMasterControls } from "./master-access"

test("delete-only access does not expose create, edit or import on the selected master", () => {
  expect(hrMasterControls("department", ["masters.universal.department.delete", "masters.universal.designation.save", "hr.candidates.save", "hr.jobs.create"])).toEqual({ create: false, update: false, delete: true, import: false, assign: false })
})

test("employee assignment and bulk import stay independent", () => {
  expect(hrMasterControls("employee_assignments", ["masters.universal.employee_assignments.import"])).toEqual({ create: false, update: false, delete: false, import: true, assign: false })
  expect(hrMasterControls("approved_posts", ["masters.universal.approved_posts.update"])).toEqual({ create: false, update: true, delete: false, import: false, assign: false })
})
