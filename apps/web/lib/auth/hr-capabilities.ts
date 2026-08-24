import type { PageAccessDefinition } from "./page-access-types"
import { sidebarModuleLabels } from "../sidebar-module-labels"
import { hrMasterNavigation, hrNavigation } from "../unified-navigation"

export const hrPageAccess = [
  ...hrMasterNavigation.map((item) => ({
    href: item.href,
    id: `hr.${item.panelId}`,
    label: item.label,
    module: sidebarModuleLabels.masterData,
    navigation: true,
    readPermissionKey: item.requiredCapability,
    submodule: "Master Selection",
  })),
  ...hrNavigation.map((item) => ({
    href: item.href,
    id: `hr.${item.panelId}`,
    label: item.label,
    module: sidebarModuleLabels.hr,
    navigation: true,
    readPermissionKey: item.requiredCapability,
    submodule: item.label,
  })),
] satisfies PageAccessDefinition[]
