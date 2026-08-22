import { describe, expect, it } from "vitest"

import {
  expandedSidebarSections,
  storedSidebarSections,
  type SidebarSectionId,
} from "./sidebar-accordion"

const sectionIds: SidebarSectionId[] = [
  "costing",
  "hr",
  "masterData",
  "operationalEntry",
  "store",
  "productionConventional",
  "productionConventional02",
  "productionCnc",
  "productionForging",
]

describe("sidebar accordion", () => {
  it("keeps only the newly selected module open", () => {
    const expanded = expandedSidebarSections("store")

    expect(sectionIds.filter((section) => expanded[section])).toEqual(["store"])
  })

  it("reduces previously saved multi-open state to the active module", () => {
    const expanded = storedSidebarSections(
      JSON.stringify({ costing: true, masterData: true, store: true }),
      expandedSidebarSections("store")
    )

    expect(sectionIds.filter((section) => expanded[section])).toEqual(["store"])
  })
})
