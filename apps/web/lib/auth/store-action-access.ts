import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "./require-capability"

export const storeRequestActionCapabilities = [
  "store.requests.issue",
  "store.requests.submit",
] as const

export const storeAssetActionCapabilities = [
  "store.asset_lifecycle.write",
  "store.asset_maintenance.write",
  "store.asset_movement.write",
  "store.asset_repair.write",
] as const

export type StoreActionCapability =
  | (typeof storeRequestActionCapabilities)[number]
  | (typeof storeAssetActionCapabilities)[number]

const legacyRequestCapabilities = ["store.requests.write", "store.manage"]
const legacyAssetCapabilities = ["store.asset_history.write", "store.manage"]

export function resolveStoreActionCapabilities(
  grantedCapabilities: readonly string[]
) {
  const granted = new Set(grantedCapabilities)
  const resolved = new Set(
    [...storeRequestActionCapabilities, ...storeAssetActionCapabilities].filter(
      (capability) => granted.has(capability)
    )
  )
  const hasGranularRequest = storeRequestActionCapabilities.some((capability) =>
    granted.has(capability)
  )
  const hasGranularAsset = storeAssetActionCapabilities.some((capability) =>
    granted.has(capability)
  )
  if (
    !hasGranularRequest &&
    legacyRequestCapabilities.some((capability) => granted.has(capability))
  ) {
    storeRequestActionCapabilities.forEach((capability) => resolved.add(capability))
  }
  if (
    !hasGranularAsset &&
    legacyAssetCapabilities.some((capability) => granted.has(capability))
  ) {
    storeAssetActionCapabilities.forEach((capability) => resolved.add(capability))
  }
  return resolved
}

export async function listGrantedStoreActions(userId: string) {
  const granted = await listGrantedCapabilities(userId, [
    ...storeRequestActionCapabilities,
    ...storeAssetActionCapabilities,
    ...legacyRequestCapabilities,
    ...legacyAssetCapabilities,
  ])
  return resolveStoreActionCapabilities(granted)
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
