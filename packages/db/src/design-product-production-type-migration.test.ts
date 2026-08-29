import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0102_design_product_production_type_masters.sql",
  import.meta.url
)

describe("Design Product Type and Production Type masters migration", () => {
  it("keeps only approved Product Types and adds DP Production Type", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(/Barstock/i)
    expect(migration).toMatch(/Forged/i)
    expect(migration).toMatch(/Moulded/i)
    expect(migration).toMatch(/Punching/i)
    expect(migration).toMatch(/DELETE FROM catalog\.design_processes/i)
    expect(migration).toMatch(/'forging', 'conventional', 'cnc'/i)
    expect(migration).toMatch(/INSERT INTO catalog\.machine_types/i)
    expect(migration).toMatch(/'DP'/)
  })
})
