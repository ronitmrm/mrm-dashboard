import { productionFloors } from "@workspace/db/production-floors"
import {
  masterPermissionKey,
  scopedMasters,
  supportedMasterActions,
} from "../../../lib/auth/master-capabilities"
import {
  operationalEntryActions,
  operationalEntryPermissionKey,
  scopedOperationalEntries,
} from "../../../lib/auth/operational-entry-capabilities"

import {
  apiOnlyPermissionKeys,
  legacyPermissionKeys,
  pageAccessCatalog,
} from "../../../lib/auth/page-access-catalog"
import {
  productionFloorMenuItem,
  productionPageCapabilities,
  productionPageLabels,
} from "../../../lib/auth/production-capabilities"
import { productionFloorPageCapabilities } from "../../../lib/auth/production-floor-capabilities"
import {
  administrationTaskCapabilities,
  taskCapabilityLabel,
} from "../../../lib/auth/task-capabilities"
import {
  qualityParameterControlKey,
  qualityParameterControlLabels,
  qualityParameterControls,
} from "../../../lib/auth/quality-parameter-controls"
import {
  productionFloorLegacyTaskCapabilities,
  productionFloorTaskCapabilities,
  productionFloorTaskDefinitions,
  productionFloorTaskIds,
} from "../../../lib/auth/production-floor-task-capabilities"
import {
  sidebarModuleForPermission,
  sidebarSubmoduleForPermission,
} from "../../../lib/sidebar-module-labels"
import {
  hrMasterNavigation,
  hrNavigation,
} from "../../../lib/unified-navigation"

export type PermissionOption = {
  key: string
  module: string
  name: string
}

export type PermissionAccessLevel = "custom" | "full" | "none" | "view"

export type PermissionAccessAction = {
  label: string
  permissionKeys: string[]
}

export type PermissionAccessRow = {
  actions: PermissionAccessAction[]
  fullPermissionKeys: string[]
  href: string | null
  id: string
  kind: "page" | "task"
  label: string
  module: string
  readPermissionKeys: string[]
  /** Screens sharing this row's permission, as named on screen. */
  screens?: string[]
  submodule: string
  supportedLevels: PermissionAccessLevel[]
}

/** Page context for display and filtering; never changes the granted keys. */
export function permissionAccessPageLabels(row: PermissionAccessRow): string[] {
  if (row.screens) return row.screens
  if (row.kind === "page") return [row.label]
  if (row.fullPermissionKeys.every((key) => apiOnlyPermissionKeys.has(key))) {
    return ["API only"]
  }

  const pageMappings: readonly (readonly [string, readonly string[]])[] = [
    ["pricing.enquiries.", ["Enquiries"]],
    ["pricing.purchase_orders.", ["Purchase Orders"]],
    ["pricing.proforma_invoices.", ["Purchase Orders"]],
    ["pricing.assemblies.", ["Assembly / BOM"]],
    ["pricing.quotes.prepare", ["Customer Parameter Costing"]],
    ["pricing.quotes.return_to_costing", ["Customer Parameter Costing"]],
    ["pricing.quotes.send", ["Quote Register"]],
    ["pricing.customer_default_terms.", ["Customers"]],
    ["pricing.customers.", ["Customers"]],
    ["pricing.masters.", ["Pricing Masters"]],
    ["pricing.website_products.", ["Website Products"]],
    [
      "pricing.price_revisions.",
      ["Product Bulk Revision", "Customer Bulk Revision", "Price Revisions"],
    ],
    ["hr.approved_posts.", ["Approved Posts"]],
    ["hr.combined_roles.", ["Combined Approved Posts"]],
    ["hr.candidates.save", ["Candidates"]],
    ["hr.candidates.assign", ["Candidates"]],
    ["hr.employees.", ["Employee Master"]],
    ["hr.job_templates.", ["Job Description Templates"]],
    ["hr.masters.", ["Masters"]],
    ["store.masters.", ["Store Masters"]],
    ["store.asset_movement.", ["Movement"]],
    ["store.asset_", ["Asset Movement & Maintenance History"]],
    ["quality.parameters.", ["Quality Inspection Parameter"]],
    ["iso.documents.", ["Document Control"]],
    ["operations.attendance.", ["Attendance"]],
    ["operations.training.", ["Training"]],
    ["pricing.corrections.", ["Corrections"]],
    // Access Administration tasks live on its tabs.
    ["administration.roles.create", ["Create Role"]],
    ["administration.roles.delete", ["Application Roles"]],
    ["administration.role_permissions.", ["Application Roles"]],
    ["administration.staff", ["Staff Accounts"]],
    ["administration.permission_overrides.", ["Staff Accounts"]],
    ["administration.devices.manage", ["Devices"]],
    ["administration.devices.bypass", ["Sign In"]],
    ["administration.screen.", ["Every Screen"]],
  ]
  const labels = row.fullPermissionKeys.flatMap(
    (key) => pageMappings.find(([prefix]) => key.startsWith(prefix))?.[1] ?? []
  )
  if (labels.length) return [...new Set(labels)]

  // Use the catalogue's page title when a submodule has one owning page.
  const pages = pageAccessCatalog.filter(
    (page) =>
      page.module === row.module &&
      (page.submodule ?? page.label) === row.submodule
  )
  return pages.length === 1 ? [pages[0]!.label] : [row.submodule]
}

function pageScreens(page: (typeof pageAccessCatalog)[number]) {
  return [...(page.screens ?? [page.label])]
}

function permissionKind(key: string) {
  for (const kind of ["read", "write", "manage"] as const) {
    const suffix = `.${kind}`
    if (key.endsWith(suffix)) {
      return { id: key.slice(0, -suffix.length), kind }
    }
  }
  return { id: key, kind: "write" as const }
}

function taskLabel(permission: PermissionOption) {
  const configuredLabel = taskCapabilityLabel(permission.key)
  const label = permission.name.trim()
  const readable =
    configuredLabel ??
    (label ? `${label[0]!.toUpperCase()}${label.slice(1)}` : permission.name)
  return apiOnlyPermissionKeys.has(permission.key)
    ? `${readable} (API only)`
    : readable
}

export function permissionAccessRows(
  permissions: readonly PermissionOption[]
): PermissionAccessRow[] {
  const permissionKeys = new Set(permissions.map(({ key }) => key))
  const pagePermissionKeys = new Set<string>()
  const entryRows: PermissionAccessRow[] = scopedOperationalEntries.flatMap(
    (entry) => {
      const actions = operationalEntryActions
        .filter((action) =>
          permissionKeys.has(
            operationalEntryPermissionKey(entry.unit, entry.entry, action)
          )
        )
        .map((action) => ({
          label: {
            read: `View ${entry.label}`,
            save: `Save ${entry.label}`,
            import: `Import ${entry.label}`,
            export: `Export ${entry.label}`,
            delete: `Delete ${entry.label}`,
          }[action],
          permissionKeys: [
            operationalEntryPermissionKey(entry.unit, entry.entry, action),
          ],
        }))
      if (!actions.length) return []
      return [
        {
          id: `entry:${entry.unit}:${entry.entry}`,
          label: entry.label,
          module: "Operational Entry",
          submodule: `${entry.scopeLabel} / Production Entries`,
          kind: "page",
          href: null,
          actions,
          readPermissionKeys: [
            operationalEntryPermissionKey(entry.unit, entry.entry, "read"),
          ],
          fullPermissionKeys: actions.flatMap(
            (action) => action.permissionKeys
          ),
          supportedLevels: ["none", "view", "full", "custom"],
        },
      ]
    }
  )
  const masterRows: PermissionAccessRow[] = scopedMasters.flatMap((master) => {
    const actions = supportedMasterActions(master)
      .filter((action) =>
        permissionKeys.has(
          masterPermissionKey(master.unit, master.master, action)
        )
      )
      .map((action) => ({
        label:
          master.master === "quality_parameter_master" && action === "save"
            ? "Save Parameter Set"
            : {
                read: `View ${master.label}`,
                save: `Add or edit ${master.label}`,
                create: `Add ${master.label}`,
                update: `Edit ${master.label}`,
                import: "Upload CSV",
                rename: `Rename ${master.label}`,
                delete: `Delete ${master.label}`,
              }[action],
        permissionKeys: [
          masterPermissionKey(master.unit, master.master, action),
          ...(master.main === "store_masters" && action === "import"
            ? [masterPermissionKey(master.unit, master.master, "save")]
            : []),
        ],
      }))
    if (master.master === "quality_parameter_master") {
      actions.push(
        ...qualityParameterControls
          .filter((control) =>
            permissionKeys.has(qualityParameterControlKey(master.unit, control))
          )
          .map((control) => ({
            label: qualityParameterControlLabels[control],
            permissionKeys: [qualityParameterControlKey(master.unit, control)],
          }))
      )
    }
    if (!actions.length) return []
    return [
      {
        id: `master:${master.unit}:${master.master}`,
        label: master.label,
        module: "Master Data",
        submodule: `${master.scopeLabel} / ${master.category}`,
        kind: "page",
        href: null,
        actions,
        readPermissionKeys: [
          masterPermissionKey(master.unit, master.master, "read"),
        ],
        fullPermissionKeys: actions.flatMap((action) => action.permissionKeys),
        supportedLevels: ["none", "view", "full", "custom"],
      },
    ]
  })
  const pageRowsByKeys = new Map<string, PermissionAccessRow>()
  // Change applies only to screens that share the write key, not view-only joiners.
  const writeScreensByRow = new Map<PermissionAccessRow, string[]>()
  const pageRows = pageAccessCatalog.flatMap((page) => {
    const hasRead = permissionKeys.has(page.readPermissionKey)
    const hasWrite = page.writePermissionKey
      ? permissionKeys.has(page.writePermissionKey)
      : false
    if (!hasRead && !hasWrite) return []
    pagePermissionKeys.add(page.readPermissionKey)
    if (page.writePermissionKey) pagePermissionKeys.add(page.writePermissionKey)
    if (page.readPermissionKey === "operations.operational_entry.read") {
      return []
    }
    if (masterRows.length && page.module === "Master Data") return []
    const readPermissionKeys = hasRead ? [page.readPermissionKey] : []
    const fullPermissionKeys = [
      ...readPermissionKeys,
      ...(hasWrite && page.writePermissionKey ? [page.writePermissionKey] : []),
    ]
    // Screens sharing one permission are one switch, so show them as one row.
    // A view-only screen joins the row that already holds its View key.
    const keysId = fullPermissionKeys.join(" ")
    const sharedRow =
      pageRowsByKeys.get(keysId) ??
      (hasWrite
        ? undefined
        : pageRowsByKeys.get(`read:${page.readPermissionKey}`))
    if (sharedRow) {
      sharedRow.screens = [...(sharedRow.screens ?? []), ...pageScreens(page)]
      if (hasWrite) writeScreensByRow.get(sharedRow)!.push(...pageScreens(page))
      const submodule = page.submodule ?? page.label
      if (!sharedRow.submodule.split(" / ").includes(submodule)) {
        sharedRow.submodule = `${sharedRow.submodule} / ${submodule}`
      }
      if (!sharedRow.module.split(" / ").includes(page.module)) {
        sharedRow.module = `${sharedRow.module} / ${page.module}`
      }
      return []
    }
    const supportedLevels: PermissionAccessLevel[] = ["none"]
    if (hasRead) supportedLevels.push("view")
    if (hasWrite) supportedLevels.push("full")
    supportedLevels.push("custom")
    const row: PermissionAccessRow = {
      actions: [
        ...(hasRead
          ? [
              {
                label: `Open ${page.label}`,
                permissionKeys: [page.readPermissionKey],
              },
            ]
          : []),
        ...(hasWrite && page.writePermissionKey
          ? [
              {
                label: `Change ${page.label}`,
                permissionKeys: [page.writePermissionKey],
              },
            ]
          : []),
      ],
      fullPermissionKeys,
      href: page.href,
      id: `page:${page.id}`,
      kind: "page" as const,
      label: page.label,
      module: page.module,
      readPermissionKeys,
      screens: pageScreens(page),
      submodule: page.submodule ?? page.label,
      supportedLevels,
    }
    pageRowsByKeys.set(keysId, row)
    writeScreensByRow.set(row, pageScreens(page))
    if (hasRead) pageRowsByKeys.set(`read:${page.readPermissionKey}`, row)
    return [row]
  })
  for (const row of pageRows) {
    if ((row.screens?.length ?? 0) < 2) continue
    const screens = row.screens!.join(" / ")
    const writeScreens = writeScreensByRow.get(row)!.join(" / ")
    row.actions = row.actions.map((action) => ({
      ...action,
      label: row.readPermissionKeys.includes(action.permissionKeys[0]!)
        ? `Open ${screens}`
        : action.label.replace(row.label, writeScreens),
    }))
    row.label = screens
  }
  const groups = new Map<
    string,
    {
      full: PermissionOption[]
      module: string
      read: PermissionOption[]
      submodule: string
    }
  >()

  const floorTaskPermissionKeys = new Set(
    Object.values(productionFloorTaskCapabilities).flatMap(Object.values)
  )
  const floorTaskRows = productionFloors.flatMap((floor) =>
    productionFloorTaskIds.flatMap((taskId) => {
      const definition = productionFloorTaskDefinitions[taskId]
      const scopedPermissionKey =
        productionFloorTaskCapabilities[floor.code][taskId]
      if (!permissionKeys.has(scopedPermissionKey)) return []
      return [
        {
          actions: [
            {
              label: definition.label,
              permissionKeys: [scopedPermissionKey],
            },
          ],
          fullPermissionKeys: [scopedPermissionKey],
          href: null,
          id: `task:production.${floor.code}.${taskId}`,
          kind: "task" as const,
          label: definition.label,
          module: floor.label,
          readPermissionKeys: [],
          screens: [productionPageLabels[definition.tab]],
          submodule: productionFloorMenuItem(definition.tab),
          supportedLevels: [
            "none",
            "full",
            "custom",
          ] as PermissionAccessLevel[],
        },
      ]
    })
  )

  for (const permission of permissions) {
    if (
      (masterRows.length > 0 &&
        (/^(pricing\.masters\.|hr\.masters\.|store\.masters\.)/.test(
          permission.key
        ) ||
          [
            "pricing.customers.create",
            "pricing.customers.update",
            "pricing.website_products.update",
            "pricing.customer_default_terms.update",
            "hr.approved_posts.create",
            "hr.approved_posts.update",
            "hr.approved_posts.delete",
            "hr.combined_roles.create",
            "hr.combined_roles.update",
            "hr.candidates.save",
            "hr.employees.assign",
            "hr.employees.bulk_assign",
            "hr.job_templates.save",
          ].includes(permission.key))) ||
      pagePermissionKeys.has(permission.key) ||
      permission.key.startsWith("masters.") ||
      permission.key.startsWith("entries.") ||
      legacyPermissionKeys.has(permission.key) ||
      floorTaskPermissionKeys.has(permission.key) ||
      productionFloorLegacyTaskCapabilities.has(permission.key)
    ) {
      continue
    }
    const { id, kind } = permissionKind(permission.key)
    const group = groups.get(id) ?? {
      full: [],
      module: sidebarModuleForPermission(permission.key, permission.module),
      read: [],
      submodule: sidebarSubmoduleForPermission(
        permission.key,
        taskLabel(permission)
      ),
    }
    if (kind === "read") group.read.push(permission)
    else group.full.push(permission)
    groups.set(id, group)
  }

  const taskRows = [...groups.entries()].map(([id, group]) => {
    const readPermissionKeys = group.read.map(({ key }) => key).sort()
    const writePermissionKeys = group.full.map(({ key }) => key).sort()
    const hasRead = readPermissionKeys.length > 0
    const hasWrite = writePermissionKeys.length > 0
    const labelSource = group.full[0] ?? group.read[0]
    if (!labelSource) throw new Error(`Permission group ${id} is empty`)
    const supportedLevels: PermissionAccessLevel[] = ["none"]
    if (hasRead) supportedLevels.push("view")
    if (hasWrite) supportedLevels.push("full")
    supportedLevels.push("custom")
    return {
      actions: [
        ...group.read.map(({ key }) => ({
          label: `View ${taskLabel(labelSource)}`,
          permissionKeys: [key],
        })),
        ...group.full.map((permission) => ({
          label: taskLabel(permission),
          permissionKeys: [permission.key],
        })),
      ],
      fullPermissionKeys: [...readPermissionKeys, ...writePermissionKeys],
      href: null,
      id,
      kind: "task" as const,
      label: taskLabel(labelSource),
      module: group.module,
      readPermissionKeys,
      submodule: group.submodule,
      supportedLevels,
    }
  })
  return [
    ...masterRows,
    ...entryRows,
    ...pageRows,
    ...floorTaskRows,
    ...taskRows,
  ].sort(
    (left, right) =>
      left.module.localeCompare(right.module) ||
      left.submodule.localeCompare(right.submodule) ||
      left.kind.localeCompare(right.kind) ||
      left.label.localeCompare(right.label)
  )
}

export function permissionKeysForSelections(
  rows: readonly PermissionAccessRow[],
  selections: Readonly<Record<string, PermissionAccessLevel>>
) {
  const permissionKeys = new Set<string>()
  for (const row of rows) {
    const level = selections[row.id] ?? "none"
    const keys =
      level === "full"
        ? row.fullPermissionKeys
        : level === "view"
          ? row.readPermissionKeys
          : []
    for (const key of keys) permissionKeys.add(key)
  }
  return normalizePermissionKeys([...permissionKeys])
}

export function normalizePermissionKeys(permissionKeys: readonly string[]) {
  const normalized = new Set(permissionKeys)
  for (const floor of productionFloors) {
    for (const taskId of productionFloorTaskIds) {
      if (normalized.has(productionFloorTaskCapabilities[floor.code][taskId])) {
        normalized.add(productionFloorTaskDefinitions[taskId].legacyCapability)
      }
    }
  }
  const productionKeys = [
    ...Object.values(productionPageCapabilities),
    ...Object.values(productionFloorPageCapabilities).flatMap(Object.values),
  ]
  if (productionKeys.some((key) => normalized.has(key))) {
    normalized.add("operations.dashboard.read")
  }
  if (
    [...hrMasterNavigation, ...hrNavigation].some(
      ({ requiredCapability }) =>
        requiredCapability !== "hr.employees.read" &&
        normalized.has(requiredCapability)
    )
  ) {
    normalized.add("hr.recruitment.read")
  }
  return [...normalized].sort()
}

export function permissionSelectionsForKeys(
  rows: readonly PermissionAccessRow[],
  permissionKeys: readonly string[]
) {
  const granted = new Set(permissionKeys)
  return Object.fromEntries(
    rows.map((row) => {
      const hasFull =
        row.fullPermissionKeys.length > row.readPermissionKeys.length &&
        row.fullPermissionKeys.every((key) => granted.has(key))
      const hasRead =
        row.readPermissionKeys.length > 0 &&
        row.readPermissionKeys.every((key) => granted.has(key))
      const hasAny = row.fullPermissionKeys.some((key) => granted.has(key))
      return [
        row.id,
        hasFull ? "full" : hasRead ? "view" : hasAny ? "custom" : "none",
      ]
    })
  ) as Record<string, PermissionAccessLevel>
}

export function permissionAccessLevelForKeys(
  row: PermissionAccessRow,
  permissionKeys: readonly string[]
): PermissionAccessLevel {
  const granted = new Set(permissionKeys)
  const selectedKeys = row.fullPermissionKeys.filter((key) => granted.has(key))
  if (selectedKeys.length === 0) return "none"
  if (
    row.readPermissionKeys.length > 0 &&
    row.readPermissionKeys.every((key) => granted.has(key)) &&
    selectedKeys.every((key) => row.readPermissionKeys.includes(key))
  ) {
    return "view"
  }
  if (selectedKeys.length === row.fullPermissionKeys.length) return "full"
  return "custom"
}

export function configuredPermissionCount(
  rows: readonly PermissionAccessRow[],
  permissionKeys: readonly string[]
) {
  return rows.filter(
    (row) => permissionAccessLevelForKeys(row, permissionKeys) !== "none"
  ).length
}

export function permissionAccessSummary(
  row: PermissionAccessRow,
  permissionKeys: readonly string[]
) {
  const level = permissionAccessLevelForKeys(row, permissionKeys)
  if (level === "none") return "No Access"
  if (level === "view") return "View Only"
  if (level === "full") return "Full Access"
  const granted = new Set(permissionKeys)
  const actionLabels = row.actions
    .filter(({ permissionKeys: keys }) => keys.every((key) => granted.has(key)))
    .map(({ label }) => label)
  return actionLabels.length ? `Custom · ${actionLabels.join(", ")}` : "Custom"
}

export function permissionKeysForPreset(
  row: PermissionAccessRow,
  permissionKeys: readonly string[],
  level: PermissionAccessLevel
) {
  const next = new Set(permissionKeys)
  if (level === "custom") return [...next].sort()
  for (const key of row.fullPermissionKeys) next.delete(key)
  const granted =
    level === "full"
      ? row.fullPermissionKeys
      : level === "view"
        ? row.readPermissionKeys
        : []
  for (const key of granted) next.add(key)
  return [...next].sort()
}

export function permissionKeysForActionToggle(
  row: PermissionAccessRow,
  permissionKeys: readonly string[],
  action: PermissionAccessAction
) {
  const next = new Set(permissionKeys)
  const selected = action.permissionKeys.every((key) => next.has(key))
  const isView = action.permissionKeys.every((key) =>
    row.readPermissionKeys.includes(key)
  )
  if (selected) {
    const removedKeys = isView ? row.fullPermissionKeys : action.permissionKeys
    for (const key of removedKeys) next.delete(key)
    if (!isView) {
      for (const dependent of row.actions) {
        if (dependent.permissionKeys.some((key) => removedKeys.includes(key))) {
          for (const key of dependent.permissionKeys) next.delete(key)
        }
      }
    }
  } else {
    for (const key of row.readPermissionKeys) next.add(key)
    for (const key of action.permissionKeys) next.add(key)
  }
  return [...next].sort()
}

// Screen protection has its own per-person form in Staff Accounts.
const screenProtectionKeys: ReadonlySet<string> = new Set([
  administrationTaskCapabilities.printScreen,
  administrationTaskCapabilities.screenWithoutWatermark,
  administrationTaskCapabilities.unfocusedScreenView,
])

/** Rows a person's individual allow/block exceptions can be set on. */
export function staffOverrideRows(permissions: readonly PermissionOption[]) {
  return permissionAccessRows(permissions).filter(
    (row) =>
      !row.fullPermissionKeys.some((key) => screenProtectionKeys.has(key))
  )
}

/**
 * Turns submitted allow/block keys into the person's full override set.
 * Allows carry the same hidden companion keys roles get; `scopeKeys` limits
 * what a save may add or remove, so unrelated overrides stay untouched.
 */
export function staffOverrideChanges(
  permissions: readonly PermissionOption[],
  allowKeys: readonly string[],
  denyKeys: readonly string[]
) {
  const registered = new Set(permissions.map(({ key }) => key))
  const rowKeys = staffOverrideRows(permissions).flatMap(
    (row) => row.fullPermissionKeys
  )
  const editable = new Set(rowKeys)
  if ([...allowKeys, ...denyKeys].some((key) => !editable.has(key))) {
    throw new Error("A selected permission is not available")
  }
  if (allowKeys.some((key) => denyKeys.includes(key))) {
    throw new Error("A permission cannot be both allowed and blocked")
  }
  const withCompanions = (keys: readonly string[]) =>
    normalizePermissionKeys(keys).filter((key) => registered.has(key))
  return {
    overrides: [
      ...withCompanions(allowKeys).map((permissionKey) => ({
        effect: "allow" as const,
        permissionKey,
      })),
      ...[...new Set(denyKeys)].map((permissionKey) => ({
        effect: "deny" as const,
        permissionKey,
      })),
    ],
    scopeKeys: withCompanions(rowKeys),
  }
}
