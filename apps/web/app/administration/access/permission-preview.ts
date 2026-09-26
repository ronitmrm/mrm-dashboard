import { scopedMasters } from "../../../lib/auth/master-capabilities"
import { productionFloorScreenHref } from "../../../lib/auth/production-capabilities"
import { productionFloorTaskDefinitions } from "../../../lib/auth/production-floor-task-capabilities"
import { masterFormHref, parseMasterUnit } from "../../../lib/master-module"
import { operationalEntryFormHref } from "../../../lib/operational-entry-module"

import type {
  PermissionAccessAction,
  PermissionAccessRow,
} from "./permission-access"

// Every task without its own page points to the screen where its control lives.
const taskHrefs: Record<string, string> = {
  "administration.staff_roles.assign": "/administration/access?section=staff",
  "administration.roles.create": "/administration/access?section=create",
  "administration.roles.delete": "/administration/access?section=roles",
  "administration.staff.link": "/administration/access?section=staff",
  "administration.staff.provision": "/administration/access?section=staff",
  "administration.permission_overrides.manage":
    "/administration/access?section=staff",
  "administration.role_permissions.update":
    "/administration/access?section=roles",
  "artifacts.delete": "/administration/artifacts",
  "pricing.design.start": "/commercial/design",
  "pricing.design.save": "/commercial/design",
  "pricing.design.clarifications.request": "/commercial/design",
  "pricing.ecns.engineering_approve": "/commercial/ecns",
  "pricing.ecns.costing.complete": "/commercial/ecns",
  "pricing.ecns.create": "/commercial/ecns",
  "pricing.ecns.decision.apply": "/commercial/ecns",
  "pricing.corrections.record": "/commercial/corrections",
  "pricing.corrections.design_handoff.reverse": "/commercial/corrections",
  "pricing.corrections.product_entry.reverse": "/commercial/corrections",
  "pricing.ecns.design.complete": "/commercial/ecns",
  "pricing.price_revisions.complete": "/commercial/product-bulk-revision",
  "pricing.price_revisions.create": "/commercial/product-bulk-revision",
  "pricing.price_revisions.stages.delete": "/commercial/product-bulk-revision",
  "pricing.price_revisions.stages.update": "/commercial/product-bulk-revision",
  "pricing.assemblies.lines.add": "/commercial/assemblies",
  "pricing.costing.design_clarifications.request":
    "/commercial/product-costing",
  "pricing.costing.update": "/commercial/product-costing",
  "pricing.sales.clarifications.complete": "/commercial/sales",
  "pricing.sales.followups.complete": "/commercial/sales",
  "pricing.quotes.prepare": "/commercial/customer-costing",
  "pricing.quotes.return_to_costing": "/commercial/customer-costing",
  "pricing.quotes.send": "/commercial/quotes",
  "pricing.technical_review.update": "/commercial/technical-review",
  "hr.candidates.events.log": "/hr?panel=conversationLogsPanel",
  "hr.candidates.applications.withdraw": "/hr?panel=conversationLogsPanel",
  "hr.candidates.events.delete": "/hr?panel=conversationLogsPanel",
  "hr.candidates.events.update": "/hr?panel=conversationLogsPanel",
  "hr.interviews.schedule": "/hr?panel=interviewsPanel",
  "hr.candidates.appointments.complete": "/hr?panel=interviewWorkspacePanel",
  "hr.interviews.record": "/hr?panel=interviewWorkspacePanel",
  "hr.jobs.close": "/hr?panel=jobsPanel",
  "hr.jobs.create": "/hr?panel=jobsPanel",
  "hr.jobs.delete": "/hr?panel=jobsPanel",
  "iso.documents.approve": "/iso-document/documents",
  "iso.documents.monitor": "/iso-document/documents",
  "iso.documents.release": "/iso-document/documents",
  "iso.documents.manage": "/iso-document/documents",
  "maintenance.trade.electrical.work": "/maintenance/electrical",
  "maintenance.requests.manage": "/maintenance/approval",
  "maintenance.tasks.write": "/?tab=maintenanceTab",
  "maintenance.schedules.manage": "/?tab=maintenanceTab",
  "maintenance.definitions.manage": "/?tab=maintenanceTab",
  "maintenance.trade.mechanical.work": "/?tab=maintenanceTab",
  "maintenance.trade.plumbing.work": "/maintenance/plumbing",
  "hr.candidates.assign": "/hr?panel=candidatesPanel",
  "quality.parameters.manage":
    "/?tab=dataEntryTab&floor=cnc&entry=quality_parameter_master",
  "pricing.enquiries.items.add": "/commercial/enquiries",
  "pricing.enquiries.import_review.apply": "/commercial/enquiries",
  "pricing.proforma_invoices.approve": "/commercial/orders",
  "pricing.purchase_orders.cancel": "/commercial/orders",
  "pricing.enquiries.lines.import": "/commercial/enquiries",
  "pricing.purchase_orders.create": "/commercial/orders",
  "pricing.purchase_orders.quote_requests.create": "/commercial/orders",
  "pricing.enquiries.delete": "/commercial/enquiries",
  "pricing.proforma_invoices.generate": "/commercial/orders",
  "pricing.enquiries.handover": "/commercial/enquiries",
  "pricing.purchase_orders.import": "/commercial/orders",
  "pricing.purchase_orders.prices.decide": "/commercial/orders",
  "pricing.enquiries.create": "/commercial/enquiries",
  "pricing.proforma_invoices.mark_sent": "/commercial/orders",
  "pricing.purchase_orders.lines.add": "/commercial/orders",
  "pricing.purchase_orders.files.upload": "/commercial/orders",
  "pricing.enquiries.update": "/commercial/enquiries",
  "pricing.enquiries.items.update": "/commercial/enquiries",
  "pricing.enquiries.register.import": "/commercial/enquiries",
  "store.new_item_requests.resolve": "/store/new-item-requests",
  "store.new_item_requests.submit": "/store/new-item-requests",
  "store.receipts.receive": "/store/orders",
  "store.requests.submit": "/store/requests",
  "store.requests.issue": "/store/requests",
  "store.asset_maintenance.write": "/store/assets/RBAC-DEMO-001",
  "store.asset_repair.write": "/store/assets/RBAC-DEMO-001",
  "store.asset_movement.write": "/store/assets/RBAC-DEMO-001",
  "store.purchase_orders.create": "/store/orders",
  "store.asset_lifecycle.write": "/store/assets/RBAC-DEMO-001",
}

const assetTabs: Record<string, string> = {
  "store.asset_lifecycle.write": "Lifecycle",
  "store.asset_maintenance.write": "Maintenance",
  "store.asset_movement.write": "Movement",
  "store.asset_repair.write": "Repairs",
}

function screenshotName(href: string) {
  let hash = 2166136261
  for (const character of href) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  const slug = href
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72)
  return `${slug || "home"}-${(hash >>> 0).toString(16)}.jpg`
}

function previewHref(row: PermissionAccessRow, action: PermissionAccessAction) {
  const permissionKey = action.permissionKeys[0] ?? ""
  if (row.id.startsWith("master:")) {
    const [, unit, master] = row.id.split(":")
    const definition = scopedMasters.find(
      (item) => item.unit === unit && item.master === master
    )
    const parsedUnit = parseMasterUnit(definition?.unit)
    if (!definition || !parsedUnit) return null
    const view = /\.(read|update|rename|delete)$/.test(permissionKey)
      ? "masterTables"
      : "dataEntry"
    return masterFormHref(
      { main: definition.main, sub: definition.master, unit: parsedUnit },
      view
    )
  }

  if (row.id.startsWith("entry:")) {
    const [, unit, entry] = row.id.split(":")
    const parsedUnit = parseMasterUnit(unit)
    if (!parsedUnit || !entry) return null
    return operationalEntryFormHref(
      { main: "production_entries", sub: entry, unit: parsedUnit },
      /\.(read|export)$/.test(permissionKey) ? "masterTables" : "dataEntry"
    )
  }

  if (row.kind === "page") {
    // The local capture database has one synthetic asset for this detail page.
    return row.href?.includes(":assetCode")
      ? "/store/assets/RBAC-DEMO-001"
      : row.href
  }

  if (row.id.startsWith("task:production.")) {
    const [, floor, taskId] = row.id.split(".")
    const definition =
      productionFloorTaskDefinitions[
        taskId as keyof typeof productionFloorTaskDefinitions
      ]
    return definition && floor
      ? productionFloorScreenHref(
          definition.tab,
          floor as Parameters<typeof productionFloorScreenHref>[1]
        )
      : null
  }

  return taskHrefs[permissionKey] ?? null
}

export function permissionPreview(
  row: PermissionAccessRow,
  action: PermissionAccessAction
) {
  const href = previewHref(row, action)
  if (!href) return null
  const tab = assetTabs[action.permissionKeys[0] ?? ""]
  return {
    href,
    ...(tab
      ? {
          tab,
          selector: `section[aria-label="${tab.toLowerCase()} section"]`,
        }
      : {}),
    src: `/permission-previews/${screenshotName(tab ? `${href}#${tab}` : href)}`,
  }
}

export function permissionRowPreview(row: PermissionAccessRow) {
  const action =
    row.actions.find(({ permissionKeys }) =>
      permissionKeys.some((key) => /\.(save|create|update)$/.test(key))
    ) ?? row.actions[0]
  return action ? permissionPreview(row, action) : null
}
