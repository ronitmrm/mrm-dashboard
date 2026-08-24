export type PageAccessDefinition = {
  href: string
  id: string
  label: string
  module: string
  navigation: boolean
  readPermissionKey: string
  submodule?: string
  writePermissionKey?: string
}
