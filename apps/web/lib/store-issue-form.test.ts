import { describe, expect, test } from "vitest"

import { createStoreIssueFormModel } from "./store-issue-form"

describe("Store issue form", () => {
  test("uses request and session identity with available Non Consumable units", () => {
    expect(
      createStoreIssueFormModel({
        actorEmail: "store.manager@mayankrawmint.com",
        availableUnitIds: ["NC001-0001", "NC001-0002"],
        department: "Production",
        trackingMode: "SERIALIZED",
      })
    ).toEqual({
      availableUnitIds: ["NC001-0001", "NC001-0002"],
      department: "Production",
      issuedBy: "store.manager@mayankrawmint.com",
      requiresUnitSelection: true,
    })
  })

  test("does not ask for a Unit ID when issuing a Consumable", () => {
    expect(
      createStoreIssueFormModel({
        actorEmail: "store.manager@mayankrawmint.com",
        availableUnitIds: [],
        department: "Production",
        trackingMode: "CONSUMABLE",
      })
    ).toEqual({
      availableUnitIds: [],
      department: "Production",
      issuedBy: "store.manager@mayankrawmint.com",
      requiresUnitSelection: false,
    })
  })
})
