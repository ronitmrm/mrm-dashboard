import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0093_floor_scoped_production_page_access.sql",
  import.meta.url
)

describe("floor-scoped production page access migration", () => {
  it("creates every PPAC floor hierarchy and preserves existing grants", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toContain("'conventional', 'PPAC Conventional-01'")
    expect(migration).toContain("'conventional-02', 'PPAC Conventional-02'")
    expect(migration).toContain("'cnc', 'PPAC CNC-01'")
    expect(migration).toContain("'forging', 'PPAC Forging'")
    expect(migration).toContain("'planner_actions', 'Planner Actions'")
    expect(migration).toContain("INSERT INTO identity.role_permissions")
    expect(migration).toContain(
      "INSERT INTO identity.user_permission_overrides"
    )
  })
})
