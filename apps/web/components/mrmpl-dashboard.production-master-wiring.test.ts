import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Production master Data Entry wiring", () => {
  it("sends the selected Production Unit with manual master rows", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const form = source.slice(
      source.indexOf("function DataEntryForm"),
      source.indexOf("function QualityParameterMasterForm")
    )

    expect(source).toContain("productionFloorCode={productionFloorCode}")
    expect(form).toContain("productionFloorCode?: ProductionFloorCode;")
    expect(form).toMatch(
      /payload:\s*\{\s*\.\.\.body,\s*\.\.\.\(productionFloorCode \? \{ productionFloorCode \} : \{\}\),/
    )
  })
})
