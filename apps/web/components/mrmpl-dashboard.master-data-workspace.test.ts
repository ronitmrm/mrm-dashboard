import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("Master Data workspace", () => {
  it("shows Data Entry and Master Tables as two views of one module", () => {
    const source = readFileSync(
      new URL("./mrmpl-dashboard.tsx", import.meta.url),
      "utf8"
    )

    expect(source).toContain('<MasterDataTabs activeView="dataEntry"')
    expect(source).toContain('<MasterDataTabs activeView="masterTables"')
    expect(source).toContain('Data Entry</Link>')
    expect(source).toContain('Master Tables</Link>')
  })
})
