import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "./require-capability"

export const storeRequestActionCapabilities = [
  "store.requests.issue",
  "store.requests.submit",
] as const

export const storePurchaseActionCapabilities = [
  "store.purchase_orders.create",
  "store.receipts.receive",
] as const

export const storeNewItemRequestActionCapabilities = [
  "store.new_item_requests.resolve",
  "store.new_item_requests.submit",
] as const

export const storeAssetActionCapabilities = [
  "store.asset_lifecycle.write",
  "store.asset_maintenance.write",
  "store.asset_movement.write",
  "store.asset_repair.write",
] as const

export type StoreActionCapability =
  | (typeof storeRequestActionCapabilities)[number]
  | (typeof storePurchaseActionCapabilities)[number]
  | (typeof storeNewItemRequestActionCapabilities)[number]
  | (typeof storeAssetActionCapabilities)[number]

const legacyRequestCapabilities = ["store.requests.write", "store.manage"]
const legacyNewItemRequestCapabilities = [
  "store.new_item_requests.write",
  "store.manage",
]
const legacyAssetCapabilities = ["store.asset_history.write", "store.manage"]
const legacyPurchaseOrderCapabilities = ["store.stock.write", "store.manage"]
const legacyReceiptCapabilities = [
  "store.purchase_register.write",
  "store.manage",
]

export function resolveStoreActionCapabilities(
  grantedCapabilities: readonly string[]
) {
  const granted = new Set(grantedCapabilities)
  const resolved = new Set(
    [
      ...storeRequestActionCapabilities,
      ...storePurchaseActionCapabilities,
      ...storeNewItemRequestActionCapabilities,
      ...storeAssetActionCapabilities,
    ].filter((capability) => granted.has(capability))
  )
  const hasGranularRequest = storeRequestActionCapabilities.some((capability) =>
    granted.has(capability)
  )
  const hasGranularNewItemRequest = storeNewItemRequestActionCapabilities.some(
    (capability) => granted.has(capability)
  )
  const hasGranularAsset = storeAssetActionCapabilities.some((capability) =>
    granted.has(capability)
  )
  if (
    !hasGranularRequest &&
    legacyRequestCapabilities.some((capability) => granted.has(capability))
  ) {
    storeRequestActionCapabilities.forEach((capability) =>
      resolved.add(capability)
    )
  }
  if (
    !hasGranularNewItemRequest &&
    legacyNewItemRequestCapabilities.some((capability) =>
      granted.has(capability)
    )
  ) {
    storeNewItemRequestActionCapabilities.forEach((capability) =>
      resolved.add(capability)
    )
  }
  if (
    !hasGranularAsset &&
    legacyAssetCapabilities.some((capability) => granted.has(capability))
  ) {
    storeAssetActionCapabilities.forEach((capability) =>
      resolved.add(capability)
    )
  }
  if (
    !granted.has("store.purchase_orders.create") &&
    legacyPurchaseOrderCapabilities.some((capability) =>
      granted.has(capability)
    )
  ) {
    resolved.add("store.purchase_orders.create")
  }
  if (
    !granted.has("store.receipts.receive") &&
    legacyReceiptCapabilities.some((capability) => granted.has(capability))
  ) {
    resolved.add("store.receipts.receive")
  }
  return resolved
}

export async function listGrantedStoreActions(userId: string) {
  const granted = await listGrantedCapabilities(userId, [
    ...storeRequestActionCapabilities,
    ...storePurchaseActionCapabilities,
    ...storeNewItemRequestActionCapabilities,
    ...storeAssetActionCapabilities,
    ...legacyRequestCapabilities,
    ...legacyNewItemRequestCapabilities,
    ...legacyAssetCapabilities,
    ...legacyPurchaseOrderCapabilities,
    ...legacyReceiptCapabilities,
  ])
  return resolveStoreActionCapabilities(granted)
}

export function isStoreActionCapability(
  capability: string
): capability is StoreActionCapability {
  return [
    ...storeRequestActionCapabilities,
    ...storePurchaseActionCapabilities,
    ...storeNewItemRequestActionCapabilities,
    ...storeAssetActionCapabilities,
  ].some((candidate) => candidate === capability)
}

export async function requireStoreAction(
  capability: StoreActionCapability,
  returnPath: string
) {
  const session = await requireAuthenticatedSession(returnPath)
  const granted = await listGrantedStoreActions(session.user.id)
  if (granted.has(capability)) return session
  return requireCapability(capability, returnPath)
}
