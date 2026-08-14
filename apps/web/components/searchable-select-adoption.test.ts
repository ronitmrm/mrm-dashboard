import { readFileSync } from "node:fs"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const appRoot = new URL("../", import.meta.url)
const sharedRoot = new URL("../../../packages/ui/src/components/", import.meta.url)

function source(url: URL) {
  return readFileSync(url, "utf8")
}

function tsxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === "node_modules" || entry === ".next") return []
    const path = join(directory, entry)
    return statSync(path).isDirectory()
      ? tsxFiles(path)
      : path.endsWith(".tsx")
        ? [path]
        : []
  })
}

describe("searchable dropdown adoption", () => {
  it("keeps searchable behavior inside the shared select module", () => {
    const searchableSelect = source(new URL("searchable-select.tsx", sharedRoot))
    const nativeSelect = source(new URL("native-select.tsx", sharedRoot))

    expect(searchableSelect).toContain('type="search"')
    expect(searchableSelect).toContain('data-slot="searchable-select"')
    expect(nativeSelect).toContain("<SearchableSelect")
  })

  it("does not leave raw native dropdowns in application forms", () => {
    const remaining = tsxFiles(fileURLToPath(appRoot)).filter((file) =>
      readFileSync(file, "utf8").includes("<select")
    )

    expect(remaining).toEqual([])
  })
})
