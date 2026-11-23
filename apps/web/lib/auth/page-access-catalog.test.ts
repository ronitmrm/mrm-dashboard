import { expect, it } from "vitest"

import * as navigation from "../unified-navigation"
import { pageAccessCatalog } from "./page-access-catalog"

function menuLabels(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(menuLabels)
  if (typeof value !== "object" || value === null) return []
  const { label, title } = value as { label?: unknown; title?: unknown }
  return [label, title].filter((name) => typeof name === "string")
}

// Access Administration's Sub Module column must name what the side menu shows.
it("names every access sub module after a side-menu item", () => {
  const menu = new Set(Object.values(navigation).flatMap(menuLabels))
  const unknown = pageAccessCatalog.flatMap((page) =>
    (page.submodule ?? page.label)
      .split(" / ")
      .filter((name) => !menu.has(name))
      .map((name) => `${page.module} > ${name}`)
  )
  expect(unknown).toEqual([])
})
