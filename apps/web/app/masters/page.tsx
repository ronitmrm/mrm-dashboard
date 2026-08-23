import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { FullPageWorkspace } from "@/components/full-page-workspace"

import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import {
  autoSelectedSubMaster,
  availableMainMasters,
  availableMasterUnits,
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
  const requestedUnit = parseMasterUnit(value(query.unit))
  const unit =
    requestedUnit &&
    availableMasterUnits(access).some(({ id }) => id === requestedUnit)
      ? requestedUnit
      : ""
  const requestedMain = value(query.main)
  const main =
    unit &&
    availableMainMasters(unit, access).some(({ id }) => id === requestedMain)
      ? requestedMain
      : ""
  const requestedSub = value(query.sub)
  const sub = main
    ? subMastersFor(main, access)?.options.some(({ id }) => id === requestedSub)
      ? requestedSub
      : autoSelectedSubMaster(main, access)
    : ""

  return (
    <FullPageWorkspace>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {view === "masterTables" ? "Master Table Selection" : "Master Module"}
        </h1>
      </div>
      {value(query.error) === "invalid-selection" ? (
        <Alert className="w-full" variant="destructive">
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
    </FullPageWorkspace>
  )
}
