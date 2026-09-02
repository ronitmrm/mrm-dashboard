import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : []
  })
}

const approvedComposition = join(
  process.cwd(),
  "components",
  "ui",
  "golden-patterns.tsx"
)

function featureSources() {
  return [join(process.cwd(), "app"), join(process.cwd(), "components")]
    .flatMap(tsxFiles)
    .filter(
      (path) => path !== approvedComposition && !path.endsWith(".test.tsx")
    )
}

function filesMatching(pattern: RegExp) {
  return featureSources()
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(process.cwd(), path))
}

describe("Golden UI conformity gate", () => {
  it("rejects local table, card, and page-header replacements", () => {
    expect(filesMatching(/<table\b/)).toEqual([])
    expect(filesMatching(/<Table(?:\s|>)/)).toEqual([])
    expect(filesMatching(/<Card(?:\s|>)/)).toEqual([])
    expect(filesMatching(/\bDashboardPageHeader\b/)).toEqual([])
  })

  it("keeps the live reference wired to production components", () => {
    const reference = readFileSync(
      join(process.cwd(), "app", "ui-reference", "page.tsx"),
      "utf8"
    )

    for (const component of [
      "OperationalTable",
      "MetricCard",
      "SectionCard",
      "PageHeader",
      "ActionToolbar",
      "FormSection",
      "FormGrid",
      "StatusBadge",
      "StandardState",
    ]) {
      expect(reference).toContain(component)
    }
  })
})
