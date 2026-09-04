import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { StaffAccessRegister } from "./staff-access-register"

describe("StaffAccessRegister", () => {
  it("filters employee fields separately and opens the selected employee editor", () => {
    const markup = renderToStaticMarkup(
      <StaffAccessRegister
        canAssignRoles
        users={[
          {
            departments: ["Sales & Marketing"],
            designations: ["Executive"],
            email: "keyur@mrmpl.test",
            employeeCode: "31",
            id: "staff-31",
            inheritedRoleKeys: ["quality"],
            name: "Khattar Keyur",
            overrides: [],
            roleKeys: ["sales-marketing"],
          },
        ]}
      />
    )

    expect(markup).toContain("Employee ID")
    expect(markup).toContain("Employee Name")
    expect(markup).toContain("Designation")
    expect(markup).toContain("Department")
    expect(markup).toContain("Khattar Keyur")
    expect(markup).toContain("Sales &amp; Marketing")
    expect(markup).toContain("sales-marketing · direct")
    expect(markup).toContain("quality · post")
    expect(markup).toContain(
      "/administration/access?section=staff&amp;staff=staff-31#staff-role-assignment"
    )
    expect(markup).toContain("Edit Roles")
    expect(markup).not.toContain("Delete role")
  })
})
