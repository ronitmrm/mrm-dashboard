import { sidebarModuleLabels } from "../sidebar-module-labels"
import type { PageAccessDefinition } from "./page-access-types"

export const signaturePageAccess = {
  href: "/brand-kit/signature",
  id: "brand-kit.signature",
  label: "Signature",
  module: sidebarModuleLabels.brandKit,
  navigation: true,
  readPermissionKey: "brand-kit.signature.read",
} satisfies PageAccessDefinition

export const brandGuidePageAccess = {
  href: "/brand-kit/guide",
  id: "brand-kit.guide",
  label: "Brand Guide",
  module: sidebarModuleLabels.brandKit,
  navigation: true,
  readPermissionKey: "brand-kit.guide.read",
} satisfies PageAccessDefinition

export const brandKitPageAccess = [signaturePageAccess, brandGuidePageAccess]
