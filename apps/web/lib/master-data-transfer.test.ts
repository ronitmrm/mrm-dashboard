import { describe, expect, it } from "vitest"

import { masterDataTransferAction } from "./master-data-transfer"

describe("Master Data transfer toolbar", () => {
  it("shows CSV import only in Data Entry", () => {
    expect(
      masterDataTransferAction("dataEntry", {
        csvImport: true,
        export: true,
      })
    ).toBe("csvImport")
  })

  it("shows export only in Master Table", () => {
    expect(
      masterDataTransferAction("masterTables", {
        csvImport: true,
        export: true,
      })
    ).toBe("export")
  })

  it("does not show an unavailable action", () => {
    expect(
      masterDataTransferAction("masterTables", {
        csvImport: true,
        export: false,
      })
    ).toBeNull()
  })
})
