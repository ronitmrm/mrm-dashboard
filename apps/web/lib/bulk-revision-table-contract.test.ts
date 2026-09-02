import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

const revisionPages = [
  "app/commercial/product-costing/revisions/[revisionId]/page.tsx",
  "app/commercial/customer-bulk-revision/page.tsx",
  "app/commercial/customer-costing/revisions/[revisionId]/page.tsx",
]

describe("Bulk revision product tables", () => {
  it("use column filters and separate product identity columns", () => {
    for (const path of revisionPages) {
      const page = source(path)

      expect(page).toMatch(/<OperationalTable[^>]*\bexcelFilters\b[^>]*>/)
      for (const label of ["UID", "Description", "Category", "Subcategory"]) {
        expect(page).toMatch(
          new RegExp(`(<TableHead[^>]*>${label}</TableHead>|"${label}",)`)
        )
      }
      expect(page).not.toMatch(/aria-label="Search (products|affected prices|active customer prices)"/)
    }
  })

  it("loads enough rows for the column filters to cover the current register", () => {
    for (const path of revisionPages) {
      expect(source(path)).toContain("limit: bulkRevisionTableLimit")
    }

    const repository = source(
      "../../packages/db/src/commercial-revisions.ts"
    )
    expect(repository).toContain("const bulkRevisionTableLimit = 10_000")
    expect(repository.match(/bulkRevisionTableLimit/g)).toHaveLength(4)
  })
})
