import { administrationPageAccess } from "./administration-capabilities"
import { brandKitPageAccess } from "./brand-kit-capabilities"
import { brandingPageAccess } from "./branding-capabilities"
import { qualityControlPageAccess } from "./quality-control-capabilities"
import { departmentStorePageAccess } from "./department-store-capabilities"
import { isoCalibrationPlanPageAccess } from "./iso-calibration-plan-capabilities"
import { commercialPageAccess } from "./commercial-capabilities"
import { storePageAccess } from "./store-capabilities"
import { hrPageAccess } from "./hr-capabilities"
import {
  productionPageAccess,
  productionPageCapabilities,
} from "./production-capabilities"
import { productionFloorPageSlugs } from "./production-floor-capabilities"
import type { PageAccessDefinition } from "./page-access-types"
import {
  calibrationPlan,
  machineMaintenancePlan,
  machineMaintenanceRegister,
  measuringInstrumentRegister,
} from "../iso-documents"
import { sidebarModuleLabels } from "../sidebar-module-labels"

// ISO registers open with another screen's View permission. Listing them here
// shows admins that granting that permission also opens these registers.
const isoSharedPageAccess = (
  [
    [measuringInstrumentRegister, "store.stock.read"],
    [calibrationPlan, "store.stock.read"],
    [calibrationPlan, "quality.control.calibration.read"],
    [machineMaintenanceRegister, "maintenance.workspace.read"],
    [machineMaintenancePlan, "maintenance.workspace.read"],
  ] as const
).map(
  ([document, readPermissionKey]): PageAccessDefinition => ({
    href: document.href,
    id: `iso.${document.href}.${readPermissionKey}`,
    label: document.title,
    module: sidebarModuleLabels.isoDocument,
    navigation: true,
    readPermissionKey,
  })
)

export const pageAccessCatalog: readonly PageAccessDefinition[] = [
  ...brandKitPageAccess,
  ...brandingPageAccess,
  ...qualityControlPageAccess,
  ...departmentStorePageAccess,
  isoCalibrationPlanPageAccess,
  ...administrationPageAccess,
  ...commercialPageAccess,
  ...storePageAccess,
  ...hrPageAccess,
  ...productionPageAccess,
  ...isoSharedPageAccess,
] as const

export const nonVisualPermissionKeys = new Set([
  // Registered keys with no current application authorization use.
  "administration.audit.read",
  "administration.migration.review",
  "planning.plan.read",
  "pricing.costing.prepare",
  "pricing.drawing_history.update",
])

export const apiOnlyPermissionKeys = new Set([
  // Active server actions with no reachable in-app control to screenshot.
  "administration.post_access.assign",
  "operations.attendance.write",
  "operations.training.write",
])

export const legacyPermissionKeys = new Set([
  ...nonVisualPermissionKeys,
  "quality.parameters.manage",
  "administration.roles.manage",
  "administration.users.manage",
  "hr.employees.write",
  "hr.recruitment.read",
  "hr.recruitment.write",
  "operations.corrections_page.read",
  "operations.dashboard.read",
  ...Object.keys(productionFloorPageSlugs).map(
    (tab) =>
      productionPageCapabilities[tab as keyof typeof productionPageCapabilities]
  ),
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
