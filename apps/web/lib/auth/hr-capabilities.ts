import type { PageAccessDefinition } from "./page-access-types"
import { sidebarModuleLabels } from "../sidebar-module-labels"
import { hrMasterNavigation, hrNavigation } from "../unified-navigation"

export const hrPageAccess = [...hrMasterNavigation, ...hrNavigation].map(
  (item) => ({
    href: item.href,
    id: `hr.${item.panelId}`,
    label: item.label,
    module: sidebarModuleLabels.hr,
    navigation: true,
    readPermissionKey: item.requiredCapability,
  })
) satisfies PageAccessDefinition[]
