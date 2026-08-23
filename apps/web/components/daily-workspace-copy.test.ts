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
    const registerCopy = [
      "../app/commercial/assemblies/page.tsx",
      "../app/commercial/customer-bulk-revision/page.tsx",
      "../app/commercial/customer-costing/page.tsx",
      "../app/commercial/customers/page.tsx",
      "../app/commercial/design/page.tsx",
      "../app/commercial/drawing-history/page.tsx",
      "../app/commercial/drawing-history/log/page.tsx",
      "../app/commercial/ecns/page.tsx",
      "../app/commercial/enquiries/page.tsx",
      "../app/commercial/enquiries/[id]/page.tsx",
      "../app/commercial/enquiries/excel-view/page.tsx",
      "../app/commercial/orders/page.tsx",
      "../app/commercial/pricing/page.tsx",
      "../app/commercial/pricing/revisions/page.tsx",
      "../app/commercial/product-bulk-revision/page.tsx",
      "../app/commercial/product-costing/page.tsx",
      "../app/commercial/products/page.tsx",
      "../app/commercial/quotes/page.tsx",
      "../app/commercial/sales/page.tsx",
      "../app/store/orders/page.tsx",
      "../app/store/assets/[assetCode]/page.tsx",
      "../app/administration/access/page.tsx",
      "../app/hr/page.tsx",
      "../app/masters/page.tsx",
      "../app/operational-entry/page.tsx",
      "./commercial/costing-calculator.tsx",
      "./hr/candidate-assignment-panel.tsx",
      "./hr/interview-workspace.tsx",
      "./production-sessions-workspace.tsx",
    ].map(source)
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
      ...registerCopy,
    ].join("\n")

    const redundantCopy = [
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
      "Current Customer Prices With Immutable Product/Calculation",
      "Follow Every Enquiry Line From Sales Intake",
      "Filter Any Column Like A Workbook.",
      "Sales Intake, Commercial Handover, Technical Review",
      "Current Handover State And Line Count",
      "Technically approved enquiry lines arrive here",
      "Open Review Work In A Dedicated Page.",
      "One Sales Task Queue With Quote-Created Follow-Ups",
      "Clarifications, Technical Handovers, Quote-Ready Work",
      "Every Saved Follow-Up, Including Pending And Completed Work.",
      "Saved Sent-Quote History With Follow-Up Coverage.",
      "Canonical Product Identities And Pricing Calculation Inputs.",
      "Every Retained Quote Revision And Its Historical Snapshot Tree.",
      "In-Progress, Ready, Active, And Superseded Quote Revisions.",
      "Ordered Parent/Component Rows Used By Package And Assembly Costing.",
      "Canonical Customer Masters With Immutable Pricing Source Provenance.",
      "Revision-Keyed Production Drawing Control.",
      "Drawing Number, Revision, Effective Date",
      "Every Drawing Revision And Saved Change",
      "Imported, Matched, Pi, Approved, And Cancelled Orders",
      "Product-Side Work Is Separated By New Design",
      "New Quotes, Customer-Side Revisions, ECNs",
      "Customer Costing Progress Is Decisions Recorded",
      "Product-Side Requests Only. Applied Product Changes",
      "Open Customer-Side Requests Only.",
      "Ordered and received quantities remain together in one register.",
      "Open the existing master-specific form",
      "Select the Unit, Main Entry, and Entry Table",
      "Is Part Of The Authenticated Mrmpl Dashboard",
      "Provision Fresh Better Auth Identities",
      "Start and review sessions for",
      "Select a running machine and verify its current planning details.",
      "Search the session history for this Production Unit.",
      "Select One Job First, Use The Column Filters",
      "Select A Date To See Exactly How Many Interviews",
      "Open Any Completed Round To Review",
      "This Vertical Slice Runs The Pricing Formula Engine",
      "Intermediate Values Remain Visible For Workbook Reconciliation.",
      "Every outsourced repair PO remains linked",
      "Complete immutable assignment and transfer history",
      "Purchase prices for this Asset Type are kept with the Asset.",
      "Open a Unit ID to see its movement",
      "Every recorded supplier quote remains visible",
      "Ordered Products And Bom-Adjacent Parts",
      "Each Mutation Below Repeats Its Better Auth Capability Check",
    ]

    expect(redundantCopy.filter((copy) => renderedCopy.includes(copy))).toEqual(
      []
    )

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
