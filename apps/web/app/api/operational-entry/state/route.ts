import { type NextRequest } from "next/server"
import { parseProductionFloorCode } from "@workspace/db/production-floors"
import { operationalEntryCapability } from "@/lib/auth/operational-entry-capabilities"
import {
  isProductionOperationalEntry,
  operationalEntrySnapshot,
} from "@/lib/auth/operational-entry-access"
import {
  DashboardReadError,
  withDashboardReadRepository,
} from "@/lib/postgres-dashboard-read-server"
import { productionModuleIsEnabled } from "@/lib/production-module"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!productionModuleIsEnabled())
    return Response.json(
      { error: "Production module is temporarily disabled" },
      { status: 404 }
    )
  const params = request.nextUrl.searchParams
  const entry = params.get("entry") ?? ""
  const floor = parseProductionFloorCode(params.get("floor"))
  if (!floor || !isProductionOperationalEntry(entry))
    return Response.json(
      { error: "Unknown operational entry or Production Unit." },
      { status: 400 }
    )
  try {
    const response = await withDashboardReadRepository(
      request,
      async ({ organizationId, repository }) => {
        const state = await repository.state(organizationId, {}, floor)
        return {
          productionFloorCode: floor,
          version: state.version,
          notModified: false,
          coverage: null,
          status: { isRefreshing: state.status.isRefreshing },
          dashboard: operationalEntrySnapshot(state.dashboard, entry, floor),
        }
      },
      operationalEntryCapability(entry, "read", floor),
      floor
    )
    return Response.json(response, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof DashboardReadError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      )
    throw error
  }
}
