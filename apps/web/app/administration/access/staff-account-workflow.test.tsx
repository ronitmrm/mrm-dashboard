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
            departments: ["Design & Engineering"],
            designations: ["Manager"],
          },
        ]}
      />
    )

    expect(markup).toContain("1. Select Employee &amp; Create Account")
    expect(markup).toContain('name="employee"')
    expect(markup).toContain("Khattar Ankit selected.")
    expect(markup).toContain('&quot;employeeCode&quot;:&quot;33&quot;')
    expect(markup).not.toContain('id="staff-employee"')
    expect(markup).toContain("Design &amp; Engineering")
    expect(markup).toContain("Manager")
    expect(markup).not.toContain('name="name"')
    expect(markup).not.toContain("Link Employee / Posts (Optional)")
  })

  it("lets an administrator replace one staff account's direct roles", () => {
    const markup = renderToStaticMarkup(
      <StaffAccountWorkflow
        canProvision={false}
        canAssignRoles
        created={false}
        users={[
          {
            id: "staff-1",
            name: "Sales Employee",
            email: "sales@mrmpl.test",
            roleKeys: ["sales-marketing"],
            inheritedRoleKeys: [],
            employeeCode: "62",
            departments: ["Sales & Marketing"],
            designations: ["Executive"],
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
    expect(markup).toContain("Sales Employee selected.")
    expect(markup).not.toContain('id="staff-account"')
  })

  it("keeps multiple choices available without choosing an account to change", () => {
    const employees = ["31", "32"].map((employeeCode) => ({
      employeeCode, employeeName: `Employee ${employeeCode}`,
      organizationId: "org-1", organizationName: "MRMPL",
      departments: ["Sales"], designations: ["Executive"],
    }))
    const markup = renderToStaticMarkup(<StaffAccountWorkflow
      canProvision canAssignRoles created={false} roles={[]}
      employees={employees} users={employees.map((employee) => ({
        ...employee, id: employee.employeeCode, name: employee.employeeName,
        email: `${employee.employeeCode}@example.test`, roleKeys: [], inheritedRoleKeys: [],
      }))}
    />)
    expect(markup).toContain("2 matching employees")
    expect(markup).toContain("2 matching staff accounts")
    expect(markup).toContain('name="employee" value=""')
    expect(markup).not.toContain("Save Direct Roles")
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Create Account/)
    expect(markup).toContain('value="31"')
    expect(markup).toContain('value="32"')
    expect(markup).toContain("Clear selection")
  })
})
