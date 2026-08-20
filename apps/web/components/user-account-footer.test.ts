import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, test } from "vitest"

import { UserAccountFooter } from "./user-account-footer"

describe("UserAccountFooter", () => {
  test("shows account identity and sign out together in the sidebar footer", () => {
    const html = renderToStaticMarkup(
      createElement(UserAccountFooter, {
        user: { email: "employee@mrmpl.test", name: "Employee User" },
      })
    )

    expect(html).toContain("Employee User")
    expect(html).toContain("employee@mrmpl.test")
    expect(html).toContain('href="/account/password"')
    expect(html).toContain('aria-label="Sign out"')
  })
})
