import {
  brandingTypes,
  brandingTypeLabels,
  type BrandingType,
} from "@workspace/db/branding-domain"
import type { PageAccessDefinition } from "./page-access-types"
import { sidebarModuleLabels } from "../sidebar-module-labels"

export function brandingCapability(
  type: BrandingType,
  action: "read" | "write"
) {
  return `branding.${type}.${action}`
}
export const brandingPageAccess = brandingTypes.map((type) => ({
  href: `/branding/${type}`,
  id: `branding.${type}`,
  label: brandingTypeLabels[type],
  module: sidebarModuleLabels.branding,
  submodule: brandingTypeLabels[type],
  navigation: true,
  readPermissionKey: brandingCapability(type, "read"),
  writePermissionKey: brandingCapability(type, "write"),
})) satisfies PageAccessDefinition[]
