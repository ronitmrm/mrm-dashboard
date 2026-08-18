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
