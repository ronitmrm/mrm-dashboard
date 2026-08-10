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

  it("makes first-piece inspection device-independent without persisting the example", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )
    const firstPiecePage = source.slice(
      source.indexOf("export function FirstPieceInspectionPage"),
      source.indexOf("function HourlyQualityCheckShell")
    )

    expect(firstPiecePage).toContain("shopFloorQueueRows(productionControl)")
    expect(firstPiecePage).toContain('roleTaskMatches(row, "quality")')
    expect(firstPiecePage).toContain("readStoredFirstPieceInspectionTasks()")
    expect(firstPiecePage).toContain("Example Only")
    expect(firstPiecePage).toContain("Cannot Be Saved")
    expect(firstPiecePage).not.toContain(
      'entryType: "first_piece_inspection_report"'
    )
  })
})
