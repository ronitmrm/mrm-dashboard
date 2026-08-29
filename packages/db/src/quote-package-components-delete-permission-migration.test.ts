import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0104_quote_package_components_delete_permission.sql",
  import.meta.url
)

describe("quote package component delete permission migration", () => {
  it("allows the web role to replace quote component snapshots without broad delete access", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(
      /GRANT DELETE ON\s+sales\.quote_package_components\s+TO mrmpl_web;/
    )
    expect(migration).not.toMatch(/GRANT DELETE ON ALL TABLES/i)
  })
})
