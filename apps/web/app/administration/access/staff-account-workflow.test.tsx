import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("./actions", () => ({
  assignStaffRolesAction: vi.fn(),
  provisionStaffAction: vi.fn(),
}))

import { StaffAccountWorkflow } from "./staff-account-workflow"

describe("StaffAccountWorkflow", () => {
  it("starts account creation from an unlinked Employee Master record", () => {
    const markup = renderToStaticMarkup(
      <StaffAccountWorkflow
        canProvision
        canAssignRoles
        created={false}
        users={[]}
        roles={[]}
        employees={[
          {
            employeeCode: "33",
            employeeName: "Khattar Ankit",
            organizationId: "organization-1",
            organizationName: "MRMPL",
          },
        ]}
      />
    )

    expect(markup).toContain("1. Select Employee &amp; Create Account")
    expect(markup).toContain('name="employee"')
    expect(markup).toContain("Khattar Ankit · #33 · MRMPL")
    expect(markup).not.toContain('name="name"')
    expect(markup).not.toContain("Link Employee / Posts (Optional)")
  })

  it("lets an administrator replace one staff account's direct roles", () => {
    const markup = renderToStaticMarkup(
      <StaffAccountWorkflow
        canProvision={false}
        canAssignRoles
        created={false}
        selectedUserId="staff-1"
        users={[
          {
            id: "staff-1",
            name: "Sales Employee",
            email: "sales@mrmpl.test",
            roleKeys: ["sales-marketing"],
            inheritedRoleKeys: [],
          },
        ]}
        roles={[
          { key: "sales-marketing", name: "Sales & Marketing" },
          { key: "design-team", name: "Design Team" },
        ]}
        employees={[]}
      />
    )

    const salesCheckbox = markup.match(
      /<button[^>]*id="staff-role-sales-marketing"[^>]*>/
    )?.[0]
    expect(salesCheckbox).toContain('aria-checked="true"')
    expect(salesCheckbox).not.toContain(' disabled=""')
    expect(markup).toContain("Changes apply only to this staff account")
    expect(markup).toContain("Save Direct Roles")
  })
})
