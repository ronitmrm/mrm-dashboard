import { NextResponse, type NextRequest } from "next/server"
import { createShiftIdleOperatorRepository } from "@workspace/db"
import { productionShiftEndInstant } from "@workspace/db/production-session-domain"
import { cncShifts, isCncShift, type CncShift } from "@workspace/db/shift-idle-reasons"

import { isAppOrigin } from "@/lib/app-origin"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { productionFloorPageCapability } from "@/lib/auth/production-floor-capabilities"
import { productionFloorTaskCapability } from "@/lib/auth/production-floor-task-capabilities"
import { DashboardReadError, withDashboardReadRepository } from "@/lib/postgres-dashboard-read-server"

const floor = "cnc"
const pageCapability = productionFloorPageCapability(floor, "shopFloorTasksTab")
const editCapability = productionFloorTaskCapability(floor, "shop_floor_material")
// The first production date the end-of-shift task covers.
const firstDate = "2026-11-22"
const recentDays = 7

function shiftEnded(productionDate: string, shift: CncShift, now: Date) {
  return productionShiftEndInstant({ productionDate, shift, productionFloorCode: floor }) <= now
}

// Ended CNC shifts from the last few production dates, newest first.
function recentShifts(now: Date) {
  const day = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const keys: { productionDate: string; shift: CncShift }[] = []
  for (let index = 0; index < recentDays; index++) {
    const productionDate = day.toISOString().slice(0, 10)
    if (productionDate < firstDate) break
    for (const shift of [...cncShifts].reverse())
      if (shiftEnded(productionDate, shift, now)) keys.push({ productionDate, shift })
    day.setUTCDate(day.getUTCDate() - 1)
  }
  return keys
}

function errorResponse(error: unknown) {
  return error instanceof DashboardReadError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : NextResponse.json({ error: "Unable to load the end-of-shift attendance. Try again." }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    return await withDashboardReadRepository(request, async ({ organizationId, granted }) => {
      const repository = createShiftIdleOperatorRepository({ connectionString: readAuthEnvironment().connectionString })
      try {
        const shifts = await repository.read(organizationId, recentShifts(new Date()))
        return NextResponse.json({ shifts, canEdit: granted.has(editCapability) }, { headers: { "Cache-Control": "no-store" } })
      } finally {
        await repository.close()
      }
    }, pageCapability, floor)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && !isAppOrigin(origin, request))
      throw new DashboardReadError(403, "Use this action from the application.")
    return await withDashboardReadRepository(request, async ({ organizationId, actorUserId, granted }) => {
      if (!granted.has(editCapability))
        throw new DashboardReadError(403, "You do not have permission to record shift attendance.")
      const body: unknown = await request.json().catch(() => null)
      if (!body || typeof body !== "object") throw new DashboardReadError(400, "Invalid shift attendance.")
      const { productionDate, shift, employeeCodes } = body as Record<string, unknown>
      if (typeof productionDate !== "string" || !isCncShift(shift)
        || !recentShifts(new Date()).some((key) => key.productionDate === productionDate && key.shift === shift))
        throw new DashboardReadError(400, "Select a shift that ended in the last few days.")
      if (!Array.isArray(employeeCodes) || employeeCodes.length > 200
        || !employeeCodes.every((code): code is string => typeof code === "string" && code.trim().length > 0))
        throw new DashboardReadError(400, "Select valid operators.")
      const repository = createShiftIdleOperatorRepository({ connectionString: readAuthEnvironment().connectionString })
      try {
        const saved = await repository.save({ organizationId, actorUserId, productionDate, shift, employeeCodes })
        if (!saved) throw new DashboardReadError(400, "One of the operators was not found. Reload and try again.")
        return NextResponse.json({ shift: saved })
      } finally {
        await repository.close()
      }
    }, pageCapability, floor)
  } catch (error) {
    return errorResponse(error)
  }
}
