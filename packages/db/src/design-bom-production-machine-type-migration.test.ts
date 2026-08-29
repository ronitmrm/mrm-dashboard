import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0101_design_bom_production_machine_type.sql",
  import.meta.url
)

describe("Design BOM Product Type and Production Type migration", () => {
  it("stores Product Type separately and backfills it from existing Design data", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS production_type text/i)
    expect(migration).toMatch(/UPDATE sales\.design_bom_lines/i)
    expect(migration).toMatch(/manufacturing_process/i)
  })
})
