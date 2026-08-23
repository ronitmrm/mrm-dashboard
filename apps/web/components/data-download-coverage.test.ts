import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const excelExportPages = [
  "../app/commercial/drawing-history/page.tsx",
  "../app/commercial/enquiries/[id]/page.tsx",
  "../app/commercial/enquiries/excel-view/page.tsx",
  "../app/commercial/enquiries/page.tsx",
  "../app/commercial/masters/page.tsx",
  "../app/commercial/orders/[id]/page.tsx",
  "../app/commercial/orders/page.tsx",
  "../app/commercial/pricing/page.tsx",
  "../app/commercial/pricing/revisions/page.tsx",
  "../app/commercial/website-products/page.tsx",
  "./hr/approved-posts-table.tsx",
  "./hr/recruitment-panel.tsx",
  "../app/commercial/customers/page.tsx",
  "./bounded-result-notice.ts",
  "./master-data-csv-import-button.tsx",
  "./master-data-view-tabs.tsx",
  "./mrmpl-dashboard.tsx",
  "./production-sessions-workspace.tsx",
]

describe("data download button coverage", () => {
  it.each(excelExportPages)("uses the shared download action in %s", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8")

    expect(source).toContain("DataDownloadButton")
  })
})
