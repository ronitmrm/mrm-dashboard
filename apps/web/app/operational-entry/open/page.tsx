import { redirect } from "next/navigation"

import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  operationalEntryFormHref,
  operationalEntryModuleAccess,
  resolveOperationalEntrySelection,
} from "@/lib/operational-entry-module"

export default async function OpenOperationalEntryPage({
  searchParams,
}: {
  searchParams: Promise<{
    main?: string | string[]
    sub?: string | string[]
    unit?: string | string[]
    view?: string | string[]
  }>
}) {
  const session = await requireAuthenticatedSession("/operational-entry")
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)
  const access = operationalEntryModuleAccess(navigationAccess)
  const query = await searchParams
  const value = (input: string | string[] | undefined) =>
    Array.isArray(input) ? input[0] : input
  const view =
    value(query.view) === "masterTables" ? "masterTables" : "dataEntry"
  const selection = resolveOperationalEntrySelection(
    {
      main: value(query.main),
      sub: value(query.sub),
      unit: value(query.unit),
    },
    access,
    view
  )

  if (!selection) {
    redirect(
      view === "masterTables"
        ? "/operational-entry?view=masterTables&error=invalid-selection"
        : "/operational-entry?error=invalid-selection"
    )
  }
  redirect(operationalEntryFormHref(selection, view))
}
