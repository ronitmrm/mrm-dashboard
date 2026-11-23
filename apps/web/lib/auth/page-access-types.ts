export type PageAccessDefinition = {
  href: string
  id: string
  label: string
  module: string
  navigation: boolean
  readPermissionKey: string
  /** Menu items this permission opens, when they differ from `label`. */
  screens?: readonly string[]
  submodule?: string
  writePermissionKey?: string
  /** Buttons the write permission controls, when not just "Change {label}". */
  writeActionLabel?: string
}
