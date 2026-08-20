export type PermissionOption = {
  key: string
  module: string
  name: string
}

export type PermissionAccessLevel = "full" | "none" | "read"

export type PermissionAccessRow = {
  fullPermissionKeys: string[]
  id: string
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
  const groups = new Map<
    string,
    {
      full: PermissionOption[]
      module: string
      read: PermissionOption[]
    }
  >()

  for (const permission of permissions) {
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

  return [...groups.entries()]
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
        id,
        label: taskLabel(labelSource),
        module: group.module,
        readPermissionKeys,
        supportedLevels,
      }
    })
    .sort(
      (left, right) =>
        left.module.localeCompare(right.module) ||
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
