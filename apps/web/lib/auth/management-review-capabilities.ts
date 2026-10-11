import type { PageAccessDefinition } from "./page-access-types"

export const managementReviewCapabilities = {
  read: "iso.management_review.read",
  manage: "iso.management_review.manage",
  approve: "iso.management_review.approve",
  verify: "iso.management_review.verify",
} as const
export const managementReviewPageAccess = {
  href: "/iso-document/management-review",
  id: "iso.management_review",
  label: "Management Review Meetings",
  module: "ISO Document",
  submodule: "Management Review Meetings",
  navigation: true,
  readPermissionKey: managementReviewCapabilities.read,
} satisfies PageAccessDefinition
