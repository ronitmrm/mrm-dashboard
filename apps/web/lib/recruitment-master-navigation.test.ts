import { expect, it } from "vitest"

import {
  linkedTemplateHref,
  templateReturnPath,
} from "./recruitment-master-navigation"

it("returns to the originating HR master when a linked template closes", () => {
  const href = linkedTemplateHref(
    "JRT-0001",
    "panel=employeeMasterPanel&masterView=masterTables&kind=employee-assignment",
    true
  )
  const returnTo = new URL(href, "http://localhost").searchParams.get(
    "returnTo"
  )
  expect(templateReturnPath(returnTo)).toBe(
    "/hr?panel=employeeMasterPanel&masterView=masterTables&kind=employee-assignment"
  )
  expect(
    templateReturnPath("https://example.com/hr?panel=employeeMasterPanel")
  ).toBeNull()
})
