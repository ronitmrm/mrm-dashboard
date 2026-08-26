import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ArtifactLedgerView } from "./artifact-ledger-view"

const rows = [
  {
    actorEmail: "admin@example.test",
    actorName: "Administrator",
    byteSize: 14,
    createdAt: "2026-08-20T08:00:00.000Z",
    deletedAt: null,
    deletedByEmail: null,
    deletedByName: null,
    deletionReason: null,
    fileName: "issued quote.pdf",
    id: "artifact-1",
    lifecycleState: "current" as const,
    mediaType: "application/pdf",
    modules: ["commercial"],
    origin: "generated" as const,
    physicalReferenceCount: 2,
    previewKind: "pdf" as const,
    providerState: "deletion_failed" as const,
    publicUrl: "https://files.example.test/issued-quote.pdf",
    purposes: ["issued_quote_pdf"],
    sha256: "a".repeat(64),
    updatedAt: "2026-08-20T09:00:00.000Z",
    usages: [
      {
        businessRecord: "Q-1042 / rev 1",
        module: "commercial",
        purpose: "issued_quote_pdf",
        targetId: "quote-1",
        targetSchema: "sales",
        targetTable: "quote_items",
        version: 1,
      },
    ],
  },
  {
    actorEmail: null,
    actorName: null,
    byteSize: 80,
    createdAt: "2026-08-19T08:00:00.000Z",
    deletedAt: "2026-08-20T10:00:00.000Z",
    deletedByEmail: "admin@example.test",
    deletedByName: "Administrator",
    deletionReason: "Duplicate issued workbook",
    fileName: "issued-pi.xlsx",
    id: "artifact-2",
    lifecycleState: "deleted" as const,
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    modules: ["commercial"],
    origin: "generated" as const,
    physicalReferenceCount: 1,
    previewKind: "none" as const,
    providerState: "deleted" as const,
    publicUrl: null,
    purposes: ["issued_pi_xlsx"],
    sha256: "b".repeat(64),
    updatedAt: "2026-08-19T09:00:00.000Z",
    usages: [
      {
        businessRecord: "PI-77",
        module: "commercial",
        purpose: "issued_pi_xlsx",
        targetId: "pi-1",
        targetSchema: "sales",
        targetTable: "proforma_invoices",
        version: 1,
      },
    ],
  },
]

describe("Artifact ledger view", () => {
  it("renders totals, usages, lifecycle state, native preview, and unavailable tombstones", () => {
    const html = renderToStaticMarkup(
      <ArtifactLedgerView
        canDelete
        filters={{ page: 1, pageSize: 25, search: "Q-1042" }}
        ledger={{
          page: 1,
          pageSize: 25,
          rows,
          totalArtifacts: 2,
          totalPages: 2,
          totals: {
            allowanceBytes: 2 * 1024 * 1024 * 1024,
            livePhysicalObjects: 1,
            logicalArtifacts: 2,
            uniqueLiveBytes: 14,
          },
        }}
      />
    )

    expect(html).toContain("14 B of 2 GB")
    expect(html).toContain("Q-1042 / rev 1")
    expect(html).toContain("Current")
    expect(html).toContain("Deleted")
    expect(html).toContain("Preview")
    expect(html).toContain("Download")
    expect(html).toContain("Provider Deletion Failed")
    expect(html).toContain("https://files.example.test/issued-quote.pdf")
    expect(html).toContain("Unavailable")
    expect(html).toContain(">Delete</button>")
    expect(html).toContain(
      "Issued document deletion requires an additional permanent-unavailability warning."
    )
    expect(html).toContain("Duplicate issued workbook")
    expect(html).not.toContain("undefined")
  })

  it("preserves server filters in pagination links", () => {
    const html = renderToStaticMarkup(
      <ArtifactLedgerView
        canDelete={false}
        filters={{
          module: "commercial",
          page: 1,
          pageSize: 25,
          search: "Q-1042",
        }}
        ledger={{
          page: 1,
          pageSize: 25,
          rows,
          totalArtifacts: 2,
          totalPages: 2,
          totals: {
            allowanceBytes: 2 * 1024 * 1024 * 1024,
            livePhysicalObjects: 1,
            logicalArtifacts: 2,
            uniqueLiveBytes: 14,
          },
        }}
      />
    )

    expect(html).toContain("module=commercial")
    expect(html).toContain("search=Q-1042")
    expect(html).toContain("page=2")
  })
})
