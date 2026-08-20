import { describe, expect, it } from "vitest"

import { storeCapabilities, storeNavigationAccess } from "./store-capabilities"

describe("store page capability contract", () => {
  it("keeps each Store page and asset history independently grantable", () => {
    expect(storeCapabilities).toEqual({
      assetHistory: {
        read: "store.asset_history.read",
        write: "store.asset_history.write",
      },
      masters: {
        read: "store.masters.read",
        write: "store.masters.write",
      },
      newItemRequests: {
        read: "store.new_item_requests.read",
        write: "store.new_item_requests.write",
      },
      overview: { read: "store.overview.read" },
      purchaseRegister: {
        read: "store.purchase_register.read",
        write: "store.purchase_register.write",
      },
      requests: {
        read: "store.requests.read",
        write: "store.requests.write",
      },
      stock: {
        read: "store.stock.read",
        write: "store.stock.write",
      },
    })
  })

  it("does not expose asset history from Stock read access", () => {
    expect(storeCapabilities.stock.read).not.toBe(
      storeCapabilities.assetHistory.read
    )
    expect(storeNavigationAccess).toEqual([
      ["/store", "store.overview.read"],
      ["/store/requests", "store.requests.read"],
      ["/store/new-item-requests", "store.new_item_requests.read"],
      ["/store/orders", "store.purchase_register.read"],
      ["/store/stock", "store.stock.read"],
    ])
  })
})
