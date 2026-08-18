export const storeMasterOptions = [
  ["ITEM_TYPE", "Store Item Type"],
  ["CATEGORY", "Asset Category"],
  ["SUBCATEGORY", "Asset Subcategory"],
  ["ASSET_NAME", "Asset Name"],
  ["LOCATION", "Store Location"],
  ["SUPPLIER", "Supplier"],
  ["SUPPLIER_PRICE", "Supplier Price"],
  ["VENDOR", "Vendor"],
] as const

export type StoreMasterKey = (typeof storeMasterOptions)[number][0]

export type StoreItemIdentity = {
  assetCategoryId: string
  assetNameId: string
  assetSubcategoryId: string
  assetType: string
  id: string
  identificationName: string
  typeCode: string
}

export type StoreItemSelection = Pick<
  StoreItemIdentity,
  "assetCategoryId" | "assetNameId" | "assetSubcategoryId" | "assetType"
>

const codeLessStoreMasters = new Set<StoreMasterKey>([
  "CATEGORY",
  "SUBCATEGORY",
  "ASSET_NAME",
])

export function parseStoreMasterKey(value: unknown): StoreMasterKey | null {
  return typeof value === "string" &&
    storeMasterOptions.some(([key]) => key === value)
    ? (value as StoreMasterKey)
    : null
}

export function normalizeStoreMasterKey(value: unknown): StoreMasterKey {
  return parseStoreMasterKey(value) ?? "ITEM_TYPE"
}

export function storeMasterShowsCode(master: StoreMasterKey) {
  return !codeLessStoreMasters.has(master)
}

export function findExistingStoreItem<T extends StoreItemIdentity>(
  items: readonly T[],
  selection: StoreItemSelection,
  excludedItemId?: string
): T | null {
  return (
    items.find(
      (item) =>
        item.id !== excludedItemId &&
        item.assetType === selection.assetType &&
        item.assetCategoryId === selection.assetCategoryId &&
        item.assetSubcategoryId === selection.assetSubcategoryId &&
        item.assetNameId === selection.assetNameId
    ) ?? null
  )
}
