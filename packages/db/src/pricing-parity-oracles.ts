type LogicTicket = `LM-${number}`

type RegressionOracle = {
  id: string
  sourceOracle: string
  targetTestId: string
  ticket: LogicTicket
}

type WorkflowAuditOracle = {
  sourceCheckId: string
  targetTestId: string
  ticket: LogicTicket
}

const regressionDefinitions = [
  ["Legacy price_master is never written", "LM-00"],
  ["HR module routes enforce panel-specific access", "LM-08"],
  ["Login redirects preserve HR panel query strings", "LM-08"],
  ["Ordered quoted products convert to internal M codes", "LM-06"],
  ["Ordered quoted products create drawing history", "LM-06"],
  ["Converted products remain attached to enquiry workflow lookups", "LM-06"],
  ["Ordering preserves a previous sent timestamp", "LM-06"],
  ["Latest sent rows activate while older quotes remain revisions", "LM-01"],
  ["Customer price supersession scopes by customer part code", "LM-01"],
  [
    "Enquiry Excel shows internal UID without changing line quote status",
    "LM-03",
  ],
  ["Quote send activates prices and PO matching ignores drafts", "LM-01"],
  ["Active unsent quoted rows remain pending Sales work", "LM-03"],
  ["PO matching selects the latest active customer-code price", "LM-06"],
  ["Blank-code child revisions scope by enquiry and product", "LM-05"],
  ["Package snapshot repair never rewrites existing child snapshots", "LM-05"],
  ["Package audit detects superseded and future child links", "LM-05"],
  [
    "Repair relinks active package snapshots and supersedes old children",
    "LM-05",
  ],
  ["Repair fills missing superseded replacement links", "LM-05"],
  ["Package quotes recursively snapshot immediate BOM children", "LM-05"],
  ["Quote PDF selects historical sent rows before active revisions", "LM-05"],
  ["Sales enquiry register retains order status as line summary", "LM-03"],
  ["Ordered products create website product entries", "LM-06"],
  [
    "Ordered packages convert quoted child products to internal M codes",
    "LM-06",
  ],
  ["Pricing displays internal UID for ordered rows", "LM-05"],
  ["Pricing change date uses the latest quote or product timestamp", "LM-05"],
  ["Pricing keeps currency adjacent to converted final price", "LM-05"],
  ["PO matching ignores legacy price_master overrides", "LM-06"],
  ["Unmatched PO lines create linked quote requests", "LM-06"],
  ["Approved PI cannot be cancelled", "LM-06"],
  ["Bulk process validation reads package children through snapshots", "LM-07"],
  ["ECN package recalculation uses snapshot values and weights", "LM-07"],
  ["Bulk package recalculation accepts revised child quote IDs", "LM-07"],
  ["Pending product bulk revisions preview recalculated prices", "LM-07"],
  ["Product bulk revision expands through direct and nested usage", "LM-07"],
  ["Product bulk revision hands off before creating quote revisions", "LM-07"],
  [
    "ECN affected-price lookup walks nested package and assembly snapshots",
    "LM-07",
  ],
  [
    "ECN affected prices include ordered purchased prices without replacement",
    "LM-07",
  ],
  ["Completed ECN audit binds decisions to completion-time lineage", "LM-07"],
  ["ECN design preserves original process sources after Q conversion", "LM-07"],
  ["ECN design locks after it is sent to costing", "LM-07"],
  ["ECN changes pass through Product Costing before Customer Costing", "LM-07"],
  ["ECNs are logged and opened from a standalone register", "LM-07"],
  ["Calculated statuses are omitted from Pricing Excel exports", "LM-05"],
  ["Table CSV exports can hide displayed system columns", "LM-08"],
  ["Customer master workbooks ignore legacy spreadsheet status", "LM-02"],
  ["Canonical source costing formula and derived stored-cost quirk", "LM-05"],
] as const satisfies readonly (readonly [string, LogicTicket])[]

export const pricingRegressionOracles: readonly RegressionOracle[] =
  regressionDefinitions.map(([sourceOracle, ticket], index) => {
    const targetTestId = `PR-${String(index + 1).padStart(3, "0")}`
    return { id: targetTestId, sourceOracle, targetTestId, ticket }
  })

const workflowCheckIds = [
  "PRICE-001",
  "PRICE-002",
  "PRICE-003",
  "PRICE-004",
  "PRICE-005",
  "PRICE-007",
  "PRICE-008",
  "PRICE-006",
  "ORDER-001",
  "ORDER-002",
  "ORDER-003",
  "PACKAGE-001",
  "PACKAGE-002",
  "PACKAGE-003",
  "PACKAGE-004",
  "PACKAGE-010",
  "PACKAGE-011",
  "PACKAGE-012",
  "PACKAGE-005",
  "PACKAGE-006",
  "PACKAGE-007",
  "PACKAGE-008",
  "PACKAGE-009",
  "PACKAGE-010",
  "WORKFLOW-001",
  "WORKFLOW-004",
  "WORKFLOW-005",
  "WORKFLOW-002",
  "WORKFLOW-003",
  "WORKFLOW-006",
  "QUOTE-001",
  "QUOTE-002",
  "QUOTE-003",
  "QUOTE-004",
  "PRODUCT-001",
  "PRODUCT-002",
  "ECN-001",
  "FOLLOWUP-001",
  "FOLLOWUP-002",
  "PO-001",
  "PO-002",
  "PO-003",
  "PO-004",
  "PO-005",
  "PO-006",
  "BULK-001",
  "BULK-002",
  "BULK-003",
  "BULK-004",
  "BULK-005",
  "MASTER-001",
  "MASTER-002",
  "MASTER-003",
  "MASTER-004",
  "MASTER-005",
  "WEBSITE-001",
  "LEGACY-001",
] as const

function workflowTicket(sourceCheckId: string): LogicTicket {
  if (sourceCheckId.startsWith("MASTER-")) return "LM-02"
  if (
    sourceCheckId.startsWith("WORKFLOW-") ||
    sourceCheckId.startsWith("FOLLOWUP-")
  )
    return "LM-03"
  if (sourceCheckId.startsWith("PRODUCT-")) return "LM-04"
  if (
    sourceCheckId.startsWith("PRICE-") ||
    sourceCheckId.startsWith("PACKAGE-") ||
    sourceCheckId.startsWith("QUOTE-")
  )
    return "LM-05"
  if (sourceCheckId.startsWith("ORDER-") || sourceCheckId.startsWith("PO-"))
    return "LM-06"
  if (sourceCheckId.startsWith("ECN-") || sourceCheckId.startsWith("BULK-"))
    return "LM-07"
  if (sourceCheckId.startsWith("WEBSITE-")) return "LM-08"
  return "LM-00"
}

export const pricingWorkflowAuditOracles: readonly WorkflowAuditOracle[] =
  workflowCheckIds.map((sourceCheckId, index) => ({
    sourceCheckId,
    targetTestId: `WF-${String(index + 1).padStart(3, "0")}`,
    ticket: workflowTicket(sourceCheckId),
  }))

export const pricingOutputOracles = [
  "master-workbook",
  "enquiry-import-template",
  "enquiry-register",
  "enquiry-lines",
  "sales-history",
  "quote-pdf",
  "pricing-current",
  "pricing-revisions",
  "po-template",
  "po-detail",
  "po-master",
  "pi-document",
  "pi-master",
  "drawing-history",
  "website-products",
].map((family) => ({
  family,
  goldenFixture: `src/test-fixtures/pricing-output/${family}.json`,
}))

export const pricingLogicDecisions = {
  activePriceSupersession: "customer-and-normalized-code",
  ambiguousPurchaseOrderMatch: "deterministic-ranked-source-match",
  attachmentStorage: "ignored-local-bytes-with-postgresql-metadata",
  derivedProductStoredCost: "machining-price-per-piece",
  hrRecruitment: "external-proxy-repository-not-supplied",
  quotePdfMarketRates: "live-no-store-with-source-fallbacks",
  redisAuthority: "disposable",
} as const
