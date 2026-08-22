import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import {
  availableMainMasters,
  masterModuleAccess,
  parseMasterUnit,
  subMastersFor,
} from "@/lib/master-module"

import { MasterSelection } from "./master-selection"

export default async function MasterSelectionPage({
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
    Array.isArray(input) ? (input[0] ?? "") : (input ?? "")
  const view =
    value(query.view) === "masterTables" ? "masterTables" : "dataEntry"
  const unit = parseMasterUnit(value(query.unit)) ?? ""
  const requestedMain = value(query.main)
  const main =
    unit &&
    availableMainMasters(unit, access).some(({ id }) => id === requestedMain)
      ? requestedMain
      : ""
  const requestedSub = value(query.sub)
  const sub =
    main &&
    subMastersFor(main, access)?.options.some(({ id }) => id === requestedSub)
      ? requestedSub
      : ""

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {view === "masterTables" ? "Master Table Selection" : "Master Module"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {view === "masterTables"
            ? "Select the Unit, Main Master, and Sub Master for the table you want to open."
            : "Open the existing master-specific form for the required scope."}
        </p>
      </div>
      {value(query.error) === "invalid-selection" ? (
        <Alert className="mx-auto w-full max-w-3xl" variant="destructive">
          <AlertDescription>
            That master selection is inactive, mismatched, or not permitted.
            Select an available master and retry.
          </AlertDescription>
        </Alert>
      ) : null}
      <MasterSelection
        access={access}
        initial={{ main, sub, unit }}
        view={view}
      />
    </div>
  )
}
