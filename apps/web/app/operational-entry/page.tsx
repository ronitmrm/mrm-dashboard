import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { FullPageWorkspace } from "@/components/full-page-workspace"

import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  availableOperationalEntryMains,
  operationalEntryModuleAccess,
  operationalSubEntriesFor,
} from "@/lib/operational-entry-module"
import { parseMasterUnit } from "@/lib/master-module"

import { OperationalEntrySelection } from "./operational-entry-selection"

export default async function OperationalEntrySelectionPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
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
    Array.isArray(input) ? (input[0] ?? "") : (input ?? "")
  const view =
    value(query.view) === "masterTables" ? "masterTables" : "dataEntry"
  const unit = parseMasterUnit(value(query.unit)) ?? ""
  const requestedMain = value(query.main)
  const main =
    unit &&
    availableOperationalEntryMains(unit, access, view).some(
      ({ id }) => id === requestedMain
    )
      ? requestedMain
      : ""
  const requestedSub = value(query.sub)
  const sub =
    main &&
    operationalSubEntriesFor(main, access, view).some(
      ({ id }) => id === requestedSub
    )
      ? requestedSub
      : ""

  return (
    <FullPageWorkspace>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {view === "masterTables"
            ? "Operational Table Selection"
            : "Operational Entry Module"}
        </h1>
      </div>
      {value(query.error) === "invalid-selection" ? (
        <Alert className="w-full" variant="destructive">
          <AlertDescription>
            That operational selection is mismatched or not permitted. Select an
            available entry and retry.
          </AlertDescription>
        </Alert>
      ) : null}
      <OperationalEntrySelection
        access={access}
        initial={{ main, sub, unit }}
        view={view}
      />
    </FullPageWorkspace>
  )
}
