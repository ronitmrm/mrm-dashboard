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
    const masterSelection = source("../app/masters/master-selection.tsx")
    const operationalSelection = source(
      "../app/operational-entry/operational-entry-selection.tsx"
    )
    const storeMasters = source("../app/store/masters/master-workspace.tsx")
    const storeRequests = source("../app/store/requests/page.tsx")
    const planner = source("./planner-decision-workspace.tsx")
    const candidate = source("../app/hr/candidates/[id]/page.tsx")
    const recruitment = source("../app/hr/jobs/[id]/page.tsx")
    const technicalReview = source(
      "../app/commercial/technical-review/page.tsx"
    )
    const websiteProducts = source(
      "../app/commercial/website-products/page.tsx"
    )
    const renderedCopy = [
      dashboard,
      jobCard,
      machineAssets,
      register,
      masterSelection,
      operationalSelection,
      storeMasters,
      storeRequests,
      planner,
      candidate,
      recruitment,
      technicalReview,
      websiteProducts,
    ].join("\n")

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
      "Select the Unit, Main Master, and Sub Master in order",
      "Select the Unit, Main Entry, and Entry Form in order",
      "Select one Store master",
      "Use the filter in each column heading",
      "Make one planning decision at a time",
      "Update Candidate Details, Department, Designation",
      "Every Job This Candidate Has Been Assigned To.",
      "Every Scheduled Round And Saved Outcome",
      "Use The Filter On Each Column",
      "Choose The Existing Product Profile You Want To Maintain.",
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
