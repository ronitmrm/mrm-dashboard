import { describe, expect, it } from "vitest"

import { resolveStoreActionCapabilities } from "./store-action-access"

describe("Store action permission rollout", () => {
  it("keeps legacy request and asset managers working before migration", () => {
    expect([...resolveStoreActionCapabilities(["store.manage"])].sort()).toEqual([
      "store.asset_lifecycle.write",
      "store.asset_maintenance.write",
      "store.asset_movement.write",
      "store.asset_repair.write",
      "store.requests.issue",
      "store.requests.submit",
    ])
  })

  it("enforces separated request actions once granular grants exist", () => {
    expect(
      [...resolveStoreActionCapabilities([
        "store.requests.submit",
        "store.requests.write",
      ])]
    ).toEqual(["store.requests.submit"])
  })

  it("enforces separated asset actions once granular grants exist", () => {
    expect(
      [...resolveStoreActionCapabilities([
        "store.asset_history.write",
        "store.asset_movement.write",
      ])]
    ).toEqual(["store.asset_movement.write"])
  })
})
