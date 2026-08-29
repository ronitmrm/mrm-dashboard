import { readFile } from "node:fs/promises"

import { describe, expect, test } from "vitest"

describe("global panel border contract", () => {
  test("uses the strong semantic panel border for cards, fieldsets, tabs, and rounded panels", async () => {
    const stylesheet = await readFile(
      new URL("../../../packages/ui/src/styles/globals.css", import.meta.url),
      "utf8"
    )

    expect(stylesheet).toContain('[data-slot="card"]')
    expect(stylesheet).toContain('[data-slot="field-set"]')
    expect(stylesheet).toContain('[role="tablist"]')
    expect(stylesheet).toContain(".rounded-xl.border")
    expect(stylesheet).toContain("border-color: var(--color-panel-border);")
  })
})
