import { redirect } from "next/navigation"

import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  masterFormHref,
  masterModuleAccess,
  resolveMasterSelection,
} from "@/lib/master-module"

export default async function OpenMasterFormPage({
  searchParams,
}: {
  searchParams: Promise<{
    main?: string | string[]
    sub?: string | string[]
    unit?: string | string[]
    view?: string | string[]
  }>
}) {
  const session = await requireAuthenticatedSession("/masters")
  const [navigationAccess, grantedCapabilities] = await Promise.all([
    getUnifiedNavigationAccess(session.user.id),
    listGrantedCapabilities(session.user.id, ["store.masters.read"]),
  ])
  const access = masterModuleAccess(navigationAccess, {
    storeMasters: grantedCapabilities.includes("store.masters.read"),
  })
  const query = await searchParams
  const value = (input: string | string[] | undefined) =>
    Array.isArray(input) ? input[0] : input
  const view =
    value(query.view) === "masterTables" ? "masterTables" : "dataEntry"
  const selection = resolveMasterSelection(
    {
      main: value(query.main),
      sub: value(query.sub),
      unit: value(query.unit),
    },
    access
  )

  if (!selection) {
    redirect(
      view === "masterTables"
        ? "/masters?view=masterTables&error=invalid-selection"
        : "/masters?error=invalid-selection"
    )
  }
  redirect(masterFormHref(selection, view))
}
