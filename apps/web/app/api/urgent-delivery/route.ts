import { NextResponse, type NextRequest } from "next/server"
import { createUrgentDeliveryRepository } from "@workspace/db"
import { deliveryRecord } from "@workspace/db/urgent-delivery"
import { parseProductionFloorCode } from "@workspace/db/production-floors"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { productionFloorPageCapability } from "@/lib/auth/production-floor-capabilities"
import { productionFloorTaskCapability } from "@/lib/auth/production-floor-task-capabilities"
import {
  withDashboardReadRepository,
  DashboardReadError,
} from "@/lib/postgres-dashboard-read-server"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin)
      return NextResponse.json(
        { error: "Use this action from the application." },
        { status: 403 }
      )
    const raw = await request.text()
    if (raw.length > 2048)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 }
      )
    const body = deliveryRecord(JSON.parse(raw))
    const floor = parseProductionFloorCode(body.productionFloorCode)
    if (!floor || !["simulate", "apply"].includes(String(body.action)))
      throw new Error("Select a production unit and a valid simulation action.")
    return await withDashboardReadRepository(
      request,
      async ({
        organizationId,
        actorUserId,
        granted,
        repository: dashboard,
      }) => {
        if (
          body.action === "apply" &&
          !["planner_priority", "plan_override"].every((task) =>
            granted.has(
              productionFloorTaskCapability(
                floor,
                task as "planner_priority" | "plan_override"
              )
            )
          )
        )
          throw new DashboardReadError(
            403,
            "Applying a delivery plan requires priority and machine-plan permissions for this unit."
          )
        const status = await dashboard.status(organizationId)
        if (status.isRefreshing || status.lastError)
          throw new Error(
            "Wait for a successful production-plan refresh, then simulate again."
          )
        const repository = createUrgentDeliveryRepository({
          connectionString: readAuthEnvironment().connectionString,
        })
        try {
          const result = await repository.run({
            organizationId,
            actorUserId,
            productionFloorCode: floor,
            action: body.action === "apply" ? "apply" : "simulate",
            jobCardNumber:
              typeof body.jobCardNumber === "string"
                ? body.jobCardNumber.trim()
                : "",
            preferredDate:
              typeof body.preferredDate === "string" ? body.preferredDate : "",
            fingerprint:
              typeof body.fingerprint === "string"
                ? body.fingerprint
                : undefined,
          })
          return NextResponse.json(result)
        } finally {
          await repository.close()
        }
      },
      productionFloorPageCapability(floor, "productionControlTab"),
      floor
    )
  } catch (error) {
    const code = deliveryRecord(error).code
    return NextResponse.json(
      {
        error: code
          ? "Production changed during this check. Refresh and simulate again."
          : error instanceof Error
            ? error.message
            : "Unable to simulate urgent delivery.",
      },
      {
        status:
          error instanceof DashboardReadError
            ? error.status
            : code === "40001"
              ? 409
              : 400,
      }
    )
  }
}
