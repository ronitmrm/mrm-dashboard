import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0100_design_bom_delete_permission.sql",
  import.meta.url
)

describe("design BOM delete permission migration", () => {
  it("allows the web role to replace design BOM rows without broad delete access", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(
      /GRANT DELETE ON\s+sales\.design_bom_lines\s+TO mrmpl_web;/
    )
    expect(migration).not.toMatch(/GRANT DELETE ON ALL TABLES/i)
  })
})
