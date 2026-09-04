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
})
