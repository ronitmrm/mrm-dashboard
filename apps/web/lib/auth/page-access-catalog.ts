import { commercialPageAccess } from "./commercial-capabilities"
import { storePageAccess } from "./store-capabilities"
import { hrPageAccess } from "./hr-capabilities"
import { productionPageAccess } from "./production-capabilities"
import type { PageAccessDefinition } from "./page-access-types"

export const pageAccessCatalog: readonly PageAccessDefinition[] = [
  ...commercialPageAccess,
  ...storePageAccess,
  ...hrPageAccess,
  ...productionPageAccess,
] as const

export const legacyPermissionKeys = new Set([
  "hr.recruitment.read",
  "operations.dashboard.read",
  "pricing.masters.read",
  "pricing.masters.write",
  "store.asset_history.write",
  "store.manage",
  "store.read",
  "store.requests.write",
])
