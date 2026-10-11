import type { PageAccessDefinition } from "./page-access-types"
export const sipocCapabilities = {
  read: "iso.sipoc.read",
  manage: "iso.sipoc.manage",
  approve: "iso.sipoc.approve",
} as const
export const sipocPageAccess = {
  href: "/iso-document/sipoc",
  id: "iso.sipoc",
  label: "SIPOC Process Maps",
  module: "ISO Document",
  submodule: "SIPOC Process Maps",
  navigation: true,
  readPermissionKey: sipocCapabilities.read,
} satisfies PageAccessDefinition
