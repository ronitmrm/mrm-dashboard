import type { PageAccessDefinition } from "./page-access-types"

export const storeCapabilities = {
  assetHistory: {
    read: "store.asset_history.read",
  },
  assetLifecycle: { write: "store.asset_lifecycle.write" },
  assetMaintenance: { write: "store.asset_maintenance.write" },
  assetMovement: { write: "store.asset_movement.write" },
  assetRepair: { write: "store.asset_repair.write" },
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
  },
  requestIssue: { write: "store.requests.issue" },
  requestSubmit: { write: "store.requests.submit" },
  stock: {
    read: "store.stock.read",
    write: "store.stock.write",
  },
} as const

export const storePageAccess = [
  page("store.overview", "Store Overview", "/store", storeCapabilities.overview),
  page(
    "store.requests",
    "Requests & Issues",
    "/store/requests",
    storeCapabilities.requests
  ),
  page(
    "store.new_item_requests",
    "New Item Requests",
    "/store/new-item-requests",
    storeCapabilities.newItemRequests
  ),
  page(
    "store.purchase_register",
    "Purchase Register",
    "/store/orders",
    storeCapabilities.purchaseRegister
  ),
  page("store.stock", "Stock", "/store/stock", storeCapabilities.stock),
  page(
    "store.asset_history",
    "Asset Movement & Maintenance History",
    "/store/assets/:assetCode",
    storeCapabilities.assetHistory,
    false
  ),
] satisfies readonly PageAccessDefinition[]

export const storeNavigationAccess = storePageAccess
  .filter(({ navigation }) => navigation)
  .map(({ href, readPermissionKey }) => [href, readPermissionKey] as const)

function page(
  id: string,
  label: string,
  href: string,
  capabilities: { read: string; write?: string },
  navigation = true,
  module = "Store"
): PageAccessDefinition {
  return {
    href,
    id,
    label,
    module,
    navigation,
    readPermissionKey: capabilities.read,
    ...(capabilities.write ? { writePermissionKey: capabilities.write } : {}),
  }
}
