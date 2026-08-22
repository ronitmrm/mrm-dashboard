import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

const sourceRoots = ["app", "components"]

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : []
  })
}

function applicationTableSources() {
  return sourceRoots.flatMap((root) => tsxFiles(join(process.cwd(), root)))
}

describe("application table filter coverage", () => {
  it("routes every rendered table through the shared Excel-filter boundary", () => {
    const rawTableFiles = applicationTableSources()
      .filter((path) => readFileSync(path, "utf8").includes("<table"))
      .map((path) => relative(process.cwd(), path))

    expect(rawTableFiles).toEqual([])
  })

  it("does not explicitly disable Excel filters on application tables", () => {
    const disabledFilterFiles = applicationTableSources()
      .filter((path) =>
        /excelFilters\s*=\s*\{\s*false\s*\}/.test(readFileSync(path, "utf8"))
      )
      .map((path) => relative(process.cwd(), path))

    expect(disabledFilterFiles).toEqual([])
  })

  it("keeps Excel filters enabled by default in the shared table", () => {
    const source = readFileSync(
      join(process.cwd(), "../../packages/ui/src/components/table.tsx"),
      "utf8"
    )

    expect(source).toContain("excelFilters = true")
  })
})
