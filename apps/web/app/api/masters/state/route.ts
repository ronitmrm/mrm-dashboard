import type { NextRequest } from "next/server"
import { normalizeProductionFloorCode } from "@workspace/db/production-floors"
import {
  productionMasterCapability,
  productionMasterSnapshot,
} from "@/lib/auth/production-master-access"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { parseStoreMasterKey } from "@/lib/store-master-selection"
import {
  DashboardReadError,
  withDashboardReadRepository,
} from "@/lib/postgres-dashboard-read-server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const entry = params.get("entry") ?? ""
  const floor = normalizeProductionFloorCode(params.get("floor"))
  const storeMaster = parseStoreMasterKey(params.get("storeMaster"))
  const capability =
    entry === "store_masters" && storeMaster
      ? masterCapability(storeMaster, "read")
      : productionMasterCapability(entry, "read", floor)
  if (!capability)
    return Response.json({ error: "Unknown master." }, { status: 400 })
  try {
    const response = await withDashboardReadRepository(
      request,
      async ({ organizationId, repository, granted }) => {
        if (entry === "store_masters") {
          return { deliveryEnabled: false, productionFloorCode: floor }
        }
        const saveKey = productionMasterCapability(entry, "save", floor)
        const canSave = Boolean(saveKey && granted.has(saveKey))
        const scopedGrants = new Set([
          capability,
          ...(canSave && saveKey ? [saveKey] : []),
        ])
        const dependencies = [entry]
        if (
          canSave &&
          ["cycle", "tooling", "quality_parameter_master"].includes(entry)
        )
          dependencies.push("route")
        if (canSave && entry === "route")
          dependencies.push("setup_name_master", "machine_master")
        if (canSave && entry === "quality_parameter_master")
          dependencies.push("parameter_master", "measuring_instrument_master")
        if (canSave && entry === "maintenance_master")
          dependencies.push("maintenance_checklist_master")
        const state = await repository.scopedFactsState({
          organizationId,
          productionFloorCode: floor,
          entryTypes: dependencies,
          identity: [...scopedGrants].sort(),
          toolingAssetCodes: canSave && entry === "tooling",
          knownSourceRevision: params.get("knownSourceRevision"),
          knownVersion: params.has("knownVersion")
            ? Number(params.get("knownVersion"))
            : undefined,
        })
        if (state.notModified) return state
        const dashboard = productionMasterSnapshot(
          state.dashboard,
          scopedGrants,
          floor
        )
        if (canSave && entry === "tooling" && state.dashboard)
          dashboard.productionControl.toolingAssetCodes =
            state.dashboard.productionControl.toolingAssetCodes
        return { ...state, dashboard }
      },
      capability,
      floor
    )
    return Response.json(response, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof DashboardReadError)
      return Response.json(
        { error: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        }
      )
    throw error
  }
}
