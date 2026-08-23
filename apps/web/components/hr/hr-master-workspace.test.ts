import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("HR master workspace", () => {
  it("shows one selected master without recruitment metric cards", () => {
    const pageSource = readFileSync(
      new URL("../../app/hr/page.tsx", import.meta.url),
      "utf8"
    )
    const panelSource = readFileSync(
      new URL("./recruitment-panel.tsx", import.meta.url),
      "utf8"
    )
    const tablesSource = readFileSync(
      new URL("./master-tables.tsx", import.meta.url),
      "utf8"
    )

    expect(pageSource).toContain('activeItem.panelId !== "mastersPanel"')
    expect(pageSource).toContain('activeItem.panelId !== "postMasterPanel"')
    expect(panelSource).not.toContain("<RecruitmentMasterKindSelect")

    expect(panelSource).toContain('allMastersHref="/?tab=dataEntryTab"')
    expect(tablesSource).toMatch(
      /const rows =\s+kind === "department" \? masters\.departments : masters\.designations/
    )
    expect(tablesSource).not.toContain('className="grid gap-6 xl:grid-cols-2"')
  })
})
