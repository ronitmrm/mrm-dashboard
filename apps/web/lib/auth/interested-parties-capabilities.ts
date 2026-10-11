import type { PageAccessDefinition } from "./page-access-types"
export const interestedPartiesCapabilities = {
  read: "iso.interested_parties.read",
  readAll: "iso.interested_parties.read_all",
  manage: "iso.interested_parties.manage",
  verify: "iso.interested_parties.verify",
} as const
export const interestedPartiesPageAccess = {
  href: "/iso-document/interested-parties",
  id: "iso.interested_parties",
  label: "Interested Parties Requirements",
  module: "ISO Document",
  submodule: "Interested Parties Requirements",
  navigation: true,
  readPermissionKey: interestedPartiesCapabilities.read,
} satisfies PageAccessDefinition
