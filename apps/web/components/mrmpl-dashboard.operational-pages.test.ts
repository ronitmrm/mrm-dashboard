import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Production operational page loading", () => {
  it("keeps direct operational API payloads out of dashboard-state normalization", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const loader = source.slice(
      source.indexOf("function usePostgresOperationalPage"),
      source.indexOf("async function savePostgresDashboardEntry")
    )

    expect(loader).toContain("setResult({ data: body, url })")
    expect(loader).not.toContain("mergeDashboardStateResponse")
  })
})
