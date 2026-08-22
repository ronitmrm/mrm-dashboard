import { administrationPageAccess } from "./administration-capabilities"
import { commercialPageAccess } from "./commercial-capabilities"
import { storePageAccess } from "./store-capabilities"
import { hrPageAccess } from "./hr-capabilities"
import { productionPageAccess } from "./production-capabilities"
import type { PageAccessDefinition } from "./page-access-types"

export const pageAccessCatalog: readonly PageAccessDefinition[] = [
  ...administrationPageAccess,
  ...commercialPageAccess,
  ...storePageAccess,
  ...hrPageAccess,
  ...productionPageAccess,
] as const

export const legacyPermissionKeys = new Set([
  "administration.roles.manage",
  "administration.users.manage",
  "hr.employees.write",
  "hr.recruitment.read",
  "hr.recruitment.write",
  "operations.corrections_page.read",
  "operations.dashboard.read",
  "pricing.assemblies.write",
  "pricing.corrections.read",
  "pricing.corrections.write",
  "pricing.costing.write",
  "pricing.customers.write",
  "pricing.design.write",
  "pricing.drawing_history.write",
  "pricing.enquiries.write",
  "pricing.masters.read",
  "pricing.masters.write",
  "pricing.purchase_orders.write",
  "pricing.quotes.write",
  "pricing.revisions.write",
  "pricing.sales.write",
  "pricing.technical_review.write",
  "pricing.website_products.write",
  "store.asset_history.write",
  "store.manage",
  "store.new_item_requests.write",
  "store.purchase_register.write",
  "store.read",
  "store.requests.write",
  "store.stock.write",
])
