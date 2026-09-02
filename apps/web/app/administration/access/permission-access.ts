import { productionFloors } from "@workspace/db/production-floors"

import {
  legacyPermissionKeys,
  pageAccessCatalog,
} from "../../../lib/auth/page-access-catalog"
import {
  productionPageCapabilities,
  productionPageLabels,
} from "../../../lib/auth/production-capabilities"
import { productionFloorPageCapabilities } from "../../../lib/auth/production-floor-capabilities"
import { taskCapabilityLabel } from "../../../lib/auth/task-capabilities"
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
  submodule: string
  supportedLevels: PermissionAccessLevel[]
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
  if (configuredLabel) return configuredLabel
  const label = permission.name.trim()
  return label ? `${label[0]!.toUpperCase()}${label.slice(1)}` : permission.name
}

export function permissionAccessRows(
  permissions: readonly PermissionOption[]
): PermissionAccessRow[] {
  const permissionKeys = new Set(permissions.map(({ key }) => key))
  const pagePermissionKeys = new Set<string>()
  const pageRows = pageAccessCatalog.flatMap((page) => {
    const hasRead = permissionKeys.has(page.readPermissionKey)
    const hasWrite = page.writePermissionKey
      ? permissionKeys.has(page.writePermissionKey)
      : false
    if (!hasRead && !hasWrite) return []
    pagePermissionKeys.add(page.readPermissionKey)
    if (page.writePermissionKey) pagePermissionKeys.add(page.writePermissionKey)
    const readPermissionKeys = hasRead ? [page.readPermissionKey] : []
    const fullPermissionKeys = [
      ...readPermissionKeys,
      ...(hasWrite && page.writePermissionKey ? [page.writePermissionKey] : []),
    ]
    const supportedLevels: PermissionAccessLevel[] = ["none"]
    if (hasRead) supportedLevels.push("view")
    if (hasWrite) supportedLevels.push("full")
    supportedLevels.push("custom")
    return [
      {
        actions: [
          ...(hasRead
            ? [{ label: "View", permissionKeys: [page.readPermissionKey] }]
            : []),
          ...(hasWrite && page.writePermissionKey
            ? [{ label: "Edit", permissionKeys: [page.writePermissionKey] }]
            : []),
        ],
        fullPermissionKeys,
        href: page.href,
        id: `page:${page.id}`,
        kind: "page" as const,
        label: page.label,
        module: page.module,
        readPermissionKeys,
        submodule:
          page.submodule ??
          sidebarSubmoduleForPermission(page.readPermissionKey, page.label),
        supportedLevels,
      },
    ]
  })
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
      if (
        !permissionKeys.has(scopedPermissionKey) ||
        !permissionKeys.has(definition.legacyCapability)
      ) {
        return []
      }
      return [
        {
          actions: [
            {
              label: definition.label,
              permissionKeys: [
                scopedPermissionKey,
                definition.legacyCapability,
              ].sort(),
            },
          ],
          fullPermissionKeys: [
            scopedPermissionKey,
            definition.legacyCapability,
          ].sort(),
          href: null,
          id: `task:production.${floor.code}.${taskId}`,
          kind: "task" as const,
          label: definition.label,
          module: floor.label,
          readPermissionKeys: [],
          submodule: productionPageLabels[definition.tab],
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
      pagePermissionKeys.has(permission.key) ||
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
          label: "View",
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
  return [...pageRows, ...floorTaskRows, ...taskRows].sort(
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
    level === "full" ? row.fullPermissionKeys : row.readPermissionKeys
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
  } else {
    for (const key of row.readPermissionKeys) next.add(key)
    for (const key of action.permissionKeys) next.add(key)
  }
  return [...next].sort()
}
