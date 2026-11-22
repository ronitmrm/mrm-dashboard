import { NextResponse, type NextRequest } from "next/server"
import { createShiftIdleOperatorRepository, type IdleOperatorShift } from "@workspace/db"
import { isPlanningShiftClosed } from "@workspace/db/planning-rules"
import { productionFloors, type ProductionFloorCode } from "@workspace/db/production-floors"
import { productionShiftEndInstant } from "@workspace/db/production-session-domain"

import { isAppOrigin } from "@/lib/app-origin"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { productionFloorPageCapability } from "@/lib/auth/production-floor-capabilities"
import { productionFloorTaskCapability } from "@/lib/auth/production-floor-task-capabilities"
import { unitShifts } from "@/lib/dashboard-units"
import { DashboardReadError, withDashboardReadRepository } from "@/lib/postgres-dashboard-read-server"

// The first production date the end-of-shift task covers.
const firstDate = "2026-11-22"
const recentDays = 7

function unitOf(value: unknown): ProductionFloorCode {
  const floor = productionFloors.find(({ code }) => code === value)?.code
  if (!floor) throw new DashboardReadError(400, "Select a production unit.")
  return floor
}

function capabilities(floor: ProductionFloorCode) {
  return {
    page: productionFloorPageCapability(floor, "shopFloorTasksTab"),
    edit: productionFloorTaskCapability(floor, "shop_floor_material"),
  }
}

// Ended shifts of one unit from the last few production dates, newest first.
function recentShifts(floor: ProductionFloorCode, now: Date) {
  const day = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const keys: { productionFloorCode: ProductionFloorCode; productionDate: string; shift: IdleOperatorShift }[] = []
  for (let index = 0; index < recentDays; index++) {
    const productionDate = day.toISOString().slice(0, 10)
    if (productionDate < firstDate) break
    for (const shift of [...unitShifts(floor)].reverse())
      if (productionShiftEndInstant({ productionDate, shift, productionFloorCode: floor }) <= now)
        keys.push({ productionFloorCode: floor, productionDate, shift })
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
    const floor = unitOf(request.nextUrl.searchParams.get("floor"))
    const { page, edit } = capabilities(floor)
    return await withDashboardReadRepository(request, async ({ organizationId, granted }) => {
      const repository = createShiftIdleOperatorRepository({ connectionString: readAuthEnvironment().connectionString })
      try {
        const keys = recentShifts(floor, new Date())
        const [newest, oldest] = [keys[0], keys.at(-1)]
        const [shifts, calendar] = await Promise.all([
          repository.read(organizationId, keys),
          newest && oldest ? repository.readCalendar(organizationId, oldest.productionDate, newest.productionDate) : [],
        ])
        // Skip Fridays and holidays, unless someone worked or the check was already done.
        const open = shifts.filter((shift) => shift.checkedAt || shift.sessionOperators.length
          || !isPlanningShiftClosed(calendar, floor, shift.productionDate, shift.shift))
        return NextResponse.json({ shifts: open, canEdit: granted.has(edit) }, { headers: { "Cache-Control": "no-store" } })
      } finally {
        await repository.close()
      }
    }, page, floor)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && !isAppOrigin(origin, request))
      throw new DashboardReadError(403, "Use this action from the application.")
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== "object") throw new DashboardReadError(400, "Invalid shift attendance.")
    const { productionFloorCode, productionDate, shift, employeeCodes } = body as Record<string, unknown>
    const floor = unitOf(productionFloorCode)
    const { page, edit } = capabilities(floor)
    return await withDashboardReadRepository(request, async ({ organizationId, actorUserId, granted }) => {
      if (!granted.has(edit))
        throw new DashboardReadError(403, "You do not have permission to record shift attendance.")
      const key = recentShifts(floor, new Date())
        .find((recent) => recent.productionDate === productionDate && recent.shift === shift)
      if (!key) throw new DashboardReadError(400, "Select a shift that ended in the last few days.")
      if (!Array.isArray(employeeCodes) || employeeCodes.length > 200
        || !employeeCodes.every((code): code is string => typeof code === "string" && code.trim().length > 0))
        throw new DashboardReadError(400, "Select valid operators.")
      const repository = createShiftIdleOperatorRepository({ connectionString: readAuthEnvironment().connectionString })
      try {
        const saved = await repository.save({ organizationId, actorUserId, ...key, employeeCodes })
        if (!saved) throw new DashboardReadError(400, "One of the operators was not found. Reload and try again.")
        return NextResponse.json({ shift: saved })
      } finally {
        await repository.close()
      }
    }, page, floor)
  } catch (error) {
    return errorResponse(error)
  }
}
