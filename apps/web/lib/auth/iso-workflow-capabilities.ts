import type { PageAccessDefinition } from "./page-access-types"
export const isoWorkflowCapabilities = {
  read: "iso.tasks.read",
  department: "iso.tasks.department",
  manage: "iso.tasks.manage",
  verify: "iso.tasks.verify",
} as const
export const isoWorkflowPageAccess = {
  href: "/iso-document/pending-actions",
  id: "iso.tasks",
  label: "Pending Actions",
  module: "ISO Document",
  submodule: "Pending Actions",
  navigation: true,
  readPermissionKey: isoWorkflowCapabilities.read,
} satisfies PageAccessDefinition
