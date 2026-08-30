import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0108_bulk_price_revision_delete_permission.sql",
  import.meta.url
)

describe("bulk price revision delete permission migration", () => {
  it("allows the web role to remove staged changes without broad delete access", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(
      /GRANT DELETE ON\s+sales\.bulk_price_revision_changes\s+TO mrmpl_web;/
    )
    expect(migration).not.toMatch(/GRANT DELETE ON ALL TABLES/i)
  })
})
