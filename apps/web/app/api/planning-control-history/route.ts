import { NextResponse, type NextRequest } from "next/server"
import { createPlanningControlHistoryRepository } from "@workspace/db"
import { parseProductionFloorCode } from "@workspace/db/production-floors"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { productionFloorPageCapability } from "@/lib/auth/production-floor-capabilities"
import { productionFloorTaskCapability } from "@/lib/auth/production-floor-task-capabilities"
import { DashboardReadError, withDashboardReadRepository } from "@/lib/postgres-dashboard-read-server"

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const floor = parseProductionFloorCode(params.get("floor"))
    const page = Number(params.get("page") ?? 0)
    if (!floor || !Number.isSafeInteger(page) || page < 0 || page > 10000)
      throw new DashboardReadError(400, "Select a valid production unit and page.")

    return await withDashboardReadRepository(request, async ({ organizationId, granted }) => {
      const repository = createPlanningControlHistoryRepository({ connectionString: readAuthEnvironment().connectionString })
      try {
        const history = await repository.read(organizationId, floor, page)
        return NextResponse.json({
          ...history,
          canEditMachineReasons: floor === "cnc" && granted.has(productionFloorTaskCapability(floor, "plan_override")),
        }, {
          headers: { "Cache-Control": "no-store" },
        })
      } finally {
        await repository.close()
      }
    }, productionFloorPageCapability(floor, "planningControlTab"), floor)
  } catch (error) {
    return error instanceof DashboardReadError
      ? NextResponse.json({ error: error.message }, { status: error.status })
      : NextResponse.json({ error: "Could not load completed reviews." }, { status: 500 })
  }
}
