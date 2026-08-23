import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

function source(file: string) {
  return readFileSync(new URL(file, import.meta.url), "utf8")
}

describe("daily workspace copy", () => {
  it("omits redundant operator guidance while retaining consequential rules", () => {
    const dashboard = source("./mrmpl-dashboard.tsx")
    const jobCard = source("./job-card-workspace.tsx")
    const machineAssets = source("./machine-store-assets.tsx")
    const register = source("./job-card-register.tsx")
    const renderedCopy = [dashboard, jobCard, machineAssets, register].join("\n")

    for (const redundant of [
      "Immediate Attention: Rm Received And At Least One Planning Gap Exists.",
      "Planner View For Every Accepted Work Order With A Missing Planning Item",
      "Setup Completion And Dispatch Approval Actions.",
      "Machine-Wise Current Item And Next Planned Setup For Floor Teams.",
      "Search And Export Saved Operational Entries.",
      "Review Saved Master Data In Tabular Format.",
      "Open A Machine To Review Its Details",
      "The shortest route to what needs investigation.",
      "Planner rows for this Job Card.",
      "Current physical assets and complete Store assignment history",
    ]) {
      expect(renderedCopy).not.toContain(redundant)
    }

    expect(renderedCopy).toMatch(
      /All Factory Applies The Date To Every Production Department\./
    )
    expect(renderedCopy).toMatch(
      /Partially\s+Completed Readings Are Saved Automatically In This Browser\./
    )
    expect(renderedCopy).toMatch(
      /Reverse Wrong Entries\s+Without Deleting History/
    )
  })
})
