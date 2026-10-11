import type { PageAccessDefinition } from "./page-access-types"

export const isoAnalysisCapabilities = {
  read: "iso.analysis.read",
  manage: "iso.analysis.manage",
  verify: "iso.analysis.verify",
} as const

export const isoAnalysisPageAccess = [
  {
    href: "/iso-document/analysis/pest",
    id: "iso.analysis.pest",
    label: "PEST Analysis",
    module: "ISO Document",
    submodule: "PEST Analysis",
    navigation: true,
    readPermissionKey: isoAnalysisCapabilities.read,
  },
  {
    href: "/iso-document/analysis/swot",
    id: "iso.analysis.swot",
    label: "SWOT Analysis",
    module: "ISO Document",
    submodule: "SWOT Analysis",
    navigation: true,
    readPermissionKey: isoAnalysisCapabilities.read,
  },
] satisfies PageAccessDefinition[]
