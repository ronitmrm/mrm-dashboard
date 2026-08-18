export type StoreItemCodeAssetType = "CONSUMABLE" | "NON_CONSUMABLE"

export function storeItemCodeSeries(assetType: StoreItemCodeAssetType) {
  return assetType === "CONSUMABLE"
    ? { counterKey: "ITEM_TYPE_CONSUMABLE", prefix: "C" }
    : { counterKey: "ITEM_TYPE_NON_CONSUMABLE", prefix: "NC" }
}
