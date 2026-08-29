import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0106_portfolio_classification_masters.sql",
  import.meta.url
)

describe("Product Portfolio classification masters migration", () => {
  it("backfills the displayed Portfolio categories and their subcategories idempotently", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(migration).toMatch(/catalog\.website_product_profiles/i)
    expect(migration).toMatch(/profile\.category/i)
    expect(migration).toMatch(/item\.source_payload\s*->>\s*'category'/i)
    expect(migration).toMatch(/design\.internal_part_category/i)
    expect(migration).toMatch(/profile\.sub_category/i)
    expect(migration).toMatch(/item\.source_payload\s*->>\s*'subcategory'/i)
    expect(migration).toMatch(/design\.internal_part_sub_category/i)
    expect(migration).toMatch(/item\.uid_kind\s*=\s*'INTERNAL'/i)
    expect(migration).toMatch(/item\.lifecycle_status\s*=\s*'P'/i)
    expect(migration).toMatch(/INSERT INTO catalog\.item_categories/i)
    expect(migration).toMatch(/INSERT INTO catalog\.item_subcategories/i)
    expect(migration).toMatch(/JOIN catalog\.item_categories category/i)
    expect(migration).toMatch(/category_id/i)
    expect(migration.match(/ON CONFLICT DO NOTHING/gi)).toHaveLength(2)
  })
})
