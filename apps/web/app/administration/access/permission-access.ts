import {
  legacyPermissionKeys,
  pageAccessCatalog,
} from "../../../lib/auth/page-access-catalog"

export type PermissionOption = {
  key: string
  module: string
  name: string
}

export type PermissionAccessLevel = "full" | "none" | "read"

export type PermissionAccessRow = {
  fullPermissionKeys: string[]
  href: string | null
  id: string
  kind: "page" | "task"
  label: string
  module: string
  readPermissionKeys: string[]
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
  const label = permission.name.replace(/^View\s+/i, "")
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
    if (hasRead) supportedLevels.push("read")
    if (hasWrite) supportedLevels.push("full")
    return [
      {
        fullPermissionKeys,
        href: page.href,
        id: `page:${page.id}`,
        kind: "page" as const,
        label: page.label,
        module: page.module,
        readPermissionKeys,
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
    }
  >()

  for (const permission of permissions) {
    if (
      pagePermissionKeys.has(permission.key) ||
      legacyPermissionKeys.has(permission.key)
    ) {
      continue
    }
    const { id, kind } = permissionKind(permission.key)
    const group = groups.get(id) ?? {
      full: [],
      module: permission.module,
      read: [],
    }
    if (kind === "read") group.read.push(permission)
    else group.full.push(permission)
    groups.set(id, group)
  }

  const taskRows = [...groups.entries()]
    .map(([id, group]) => {
      const readPermissionKeys = group.read.map(({ key }) => key).sort()
      const writePermissionKeys = group.full.map(({ key }) => key).sort()
      const hasRead = readPermissionKeys.length > 0
      const hasWrite = writePermissionKeys.length > 0
      const labelSource = group.read[0] ?? group.full[0]
      if (!labelSource) throw new Error(`Permission group ${id} is empty`)
      const supportedLevels: PermissionAccessLevel[] = ["none"]
      if (hasRead) supportedLevels.push("read")
      if (hasWrite) supportedLevels.push("full")
      return {
        fullPermissionKeys: [...readPermissionKeys, ...writePermissionKeys],
        href: null,
        id,
        kind: "task" as const,
        label: taskLabel(labelSource),
        module: group.module,
        readPermissionKeys,
        supportedLevels,
      }
    })
  return [...pageRows, ...taskRows].sort(
    (left, right) =>
      left.module.localeCompare(right.module) ||
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
        : level === "read"
          ? row.readPermissionKeys
          : []
    for (const key of keys) permissionKeys.add(key)
  }
  return [...permissionKeys].sort()
}
