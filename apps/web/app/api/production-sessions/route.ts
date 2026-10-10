import type { NextRequest } from "next/server"
import {
  createProductionShopFloorRepository,
  normalizeProductionFloorCode,
} from "@workspace/db"
import { readAuthEnvironment } from "@/lib/auth/auth"
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
  const floor = normalizeProductionFloorCode(params.get("floor"))
  try {
    const result = await withDashboardReadRepository(
      request,
      async ({ organizationId, granted }) => {
        const repository = createProductionShopFloorRepository({
          connectionString: readAuthEnvironment().connectionString,
        })
        const input = {
          organizationId,
          productionFloorCode: floor,
          sessionId: params.get("sessionId") || undefined,
          startDate: params.get("startDate") || undefined,
          endDate: params.get("endDate") || undefined,
          limit: params.has("limit") ? Number(params.get("limit")) : undefined,
          offset: params.has("offset")
            ? Number(params.get("offset"))
            : undefined,
          efficiencyFlagsOnly: params.get("efficiencyFlagsOnly") === "1",
        }
        try {
          if (params.get("conditional") === "1")
            return await repository.readProductionSessionState({
              ...input,
              status:
                params.get("status") === "open"
                  ? "open"
                  : params.get("status") === "closed"
                    ? "closed"
                    : undefined,
              includeEvents: params.get("includeEvents") === "1",
              knownSourceRevision: params.get("knownSourceRevision"),
              identity: [...granted].sort(),
            })
          return params.get("view") === "events"
            ? await repository.readProductionSessionEvents(input)
            : await repository.readProductionSessions({
                ...input,
                status:
                  params.get("status") === "open"
                    ? "open"
                    : params.get("status") === "closed"
                      ? "closed"
                      : undefined,
              })
        } finally {
          await repository.close()
        }
      },
      "operations.dashboard.read",
      floor
    )
    return Response.json(result, { headers: { "Cache-Control": "no-store" } })
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
