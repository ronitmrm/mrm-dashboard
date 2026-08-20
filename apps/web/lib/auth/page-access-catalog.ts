import { commercialPageAccess } from "./commercial-capabilities"
import { storePageAccess } from "./store-capabilities"

export const pageAccessCatalog = [
  ...commercialPageAccess,
  ...storePageAccess,
] as const

export const legacyPermissionKeys = new Set([
  "store.manage",
  "store.read",
])
