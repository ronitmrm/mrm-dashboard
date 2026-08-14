import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Production dashboard layout", () => {
  it("keeps standalone Production pages inside the shared application shell", () => {
    const source = readFileSync(
      new URL("./layout.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toContain("<CommercialShell")
    expect(source).toContain("navigationAccess={navigationAccess}")
    expect(source).toContain(
      "user={{ email: session.user.email, name: session.user.name }}"
    )
    expect(source).not.toContain("return children")
  })
})
