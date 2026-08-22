import { describe, expect, it } from "vitest"

import { resolveStoreActionCapabilities } from "./store-action-access"

describe("Store action permission rollout", () => {
  it("keeps legacy request and asset managers working before migration", () => {
    expect(
      [...resolveStoreActionCapabilities(["store.manage"])].sort()
    ).toEqual([
      "store.asset_lifecycle.write",
      "store.asset_maintenance.write",
      "store.asset_movement.write",
      "store.asset_repair.write",
      "store.new_item_requests.resolve",
      "store.new_item_requests.submit",
      "store.purchase_orders.create",
      "store.receipts.receive",
      "store.requests.issue",
      "store.requests.submit",
    ])
  })

  it("enforces separated request actions once granular grants exist", () => {
    expect([
      ...resolveStoreActionCapabilities([
        "store.requests.submit",
        "store.requests.write",
      ]),
    ]).toEqual(["store.requests.submit"])
  })

  it("enforces separated asset actions once granular grants exist", () => {
    expect([
      ...resolveStoreActionCapabilities([
        "store.asset_history.write",
        "store.asset_movement.write",
      ]),
    ]).toEqual(["store.asset_movement.write"])
  })

  it("separates requesting Stock from creating Store purchase orders", () => {
    expect(
      [...resolveStoreActionCapabilities(["store.requests.submit"])].sort()
    ).toEqual(["store.requests.submit"])
    expect(
      [
        ...resolveStoreActionCapabilities(["store.purchase_orders.create"]),
      ].sort()
    ).toEqual(["store.purchase_orders.create"])
  })

  it("keeps legacy Stock and Purchase Register writers working", () => {
    expect(
      [...resolveStoreActionCapabilities(["store.stock.write"])].sort()
    ).toEqual(["store.purchase_orders.create"])
    expect(
      [
        ...resolveStoreActionCapabilities(["store.purchase_register.write"]),
      ].sort()
    ).toEqual(["store.receipts.receive"])
  })

  it("separates submitting and resolving New Item Requests", () => {
    expect([
      ...resolveStoreActionCapabilities([
        "store.new_item_requests.submit",
        "store.new_item_requests.write",
      ]),
    ]).toEqual(["store.new_item_requests.submit"])
  })

  it("keeps legacy New Item Request writers working", () => {
    expect(
      [
        ...resolveStoreActionCapabilities(["store.new_item_requests.write"]),
      ].sort()
    ).toEqual([
      "store.new_item_requests.resolve",
      "store.new_item_requests.submit",
    ])
  })
})
