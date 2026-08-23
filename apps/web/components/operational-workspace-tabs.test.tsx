import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams({
      operationalMain: "commercial_entries",
      operationalSub: "commercial_enquiries",
      operationalUnit: "universal",
    }),
}))
vi.mock("@/lib/operational-entry-module", () => ({
  operationalEntrySelectionFromContext: () => ({
    main: "commercial_entries",
    sub: "commercial_enquiries",
    unit: "universal",
  }),
  operationalEntrySelectionHref: () => "/operational-entry",
  operationalEntrySelectionSummary: () =>
    "Universal · Commercial Entries · Enquiries",
  withOperationalEntrySelectionContext: (href: string) => href,
}))
vi.mock("@/lib/operational-entry-transfer", () => ({
  operationalEntryTransferAction: () => "csvImport",
}))

import { OperationalWorkspaceTabs } from "./operational-workspace-tabs"

describe("Operational Workspace tabs", () => {
  it("keeps selection, views, and transfer actions in the Master Data order", () => {
    const html = renderToStaticMarkup(
      createElement(OperationalWorkspaceTabs, {
        activeView: "dataEntry",
        csvDownloadAction: createElement("a", { href: "/template.csv" }, "Download CSV"),
        csvImportAction: createElement("button", null, "Upload CSV"),
        dataEntryHref: "/entry?operationalView=dataEntry",
        masterTablesHref: "/entry?operationalView=masterTables",
      })
    )

    const back = html.indexOf("Back to Operational Entry Selection")
    const dataEntry = html.indexOf("Data Entry")
    const entryTables = html.indexOf("Entry Tables")
    const download = html.indexOf("Download CSV")
    const upload = html.indexOf("Upload CSV")

    expect(back).toBeGreaterThanOrEqual(0)
    expect(dataEntry).toBeGreaterThan(back)
    expect(entryTables).toBeGreaterThan(dataEntry)
    expect(download).toBeGreaterThan(entryTables)
    expect(upload).toBeGreaterThan(download)
    expect(html).not.toContain("Universal · Commercial Entries · Enquiries")
  })
})
