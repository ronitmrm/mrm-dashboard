import type { PageAccessDefinition } from "./page-access-types"
import { sidebarModuleLabels } from "../sidebar-module-labels"
import { administrationTaskCapabilities } from "./task-capabilities"

export const administrationPageAccess = [
  {
    href: "/administration/access",
    id: "administration.access",
    label: "Access Administration",
    module: sidebarModuleLabels.accessAdministration,
    navigation: true,
    readPermissionKey: administrationTaskCapabilities.accessPage,
  },
  {
    href: "/administration/artifacts",
    id: "administration.artifacts",
    label: "Artifacts",
    module: sidebarModuleLabels.accessAdministration,
    navigation: true,
    readPermissionKey: "artifacts.read",
    submodule: "Artifacts",
  },
] satisfies readonly PageAccessDefinition[]
