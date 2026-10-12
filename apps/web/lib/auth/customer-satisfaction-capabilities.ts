import type { PageAccessDefinition } from "./page-access-types"
export const satisfactionCapabilities = {
  read: "iso.satisfaction.read",
  manage: "iso.satisfaction.manage",
  verify: "iso.satisfaction.verify",
} as const
export const satisfactionPageAccess = {
  href: "/iso-document/customer-satisfaction",
  id: "iso.satisfaction",
  label: "Customer Satisfaction Reports",
  module: "ISO Document",
  submodule: "Customer Satisfaction Reports",
  navigation: true,
  readPermissionKey: satisfactionCapabilities.read,
} satisfies PageAccessDefinition
