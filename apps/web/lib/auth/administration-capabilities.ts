import type { PageAccessDefinition } from "./page-access-types"
import { administrationTaskCapabilities } from "./task-capabilities"

export const administrationPageAccess = [
  {
    href: "/administration/access",
    id: "administration.access",
    label: "Access Administration",
    module: "Administration",
    navigation: true,
    readPermissionKey: administrationTaskCapabilities.accessPage,
  },
] satisfies readonly PageAccessDefinition[]
