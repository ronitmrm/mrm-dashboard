import { describe, expect, it } from "vitest"

import { operationalEntryTransferAction } from "./operational-entry-transfer"

describe("Operational Entry transfer toolbar", () => {
  it("shows CSV import only in Data Entry", () => {
    expect(
      operationalEntryTransferAction("dataEntry", {
        csvImport: true,
        export: true,
      })
    ).toBe("csvImport")
  })

  it("shows export only in Entry Tables", () => {
    expect(
      operationalEntryTransferAction("masterTables", {
        csvImport: true,
        export: true,
      })
    ).toBe("export")
  })

  it("does not expose an unavailable transfer", () => {
    expect(
      operationalEntryTransferAction("masterTables", {
        csvImport: true,
        export: false,
      })
    ).toBeNull()
  })
})
