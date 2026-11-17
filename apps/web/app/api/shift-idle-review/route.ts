import { NextResponse, type NextRequest } from "next/server"
import { createShiftIdleReviewRepository } from "@workspace/db"
import { productionShiftAt, productionShiftEndInstant } from "@workspace/db/production-session-domain"
import { cncShifts, isCncShift, isShiftIdleReason, shiftIdleQueue } from "@workspace/db/shift-idle-reasons"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { productionFloorPageCapability } from "@/lib/auth/production-floor-capabilities"
import { productionFloorTaskCapability } from "@/lib/auth/production-floor-task-capabilities"
import { DashboardReadError, withDashboardReadRepository } from "@/lib/postgres-dashboard-read-server"

const floor = "cnc"
const reviewCapability = productionFloorPageCapability(floor, "planningControlTab")
const editCapability = productionFloorTaskCapability(floor, "plan_override")
// The first production date covered by the Machine Review rollout.
const firstReviewDate = "2026-11-16"
const queuePageDays = 2

function parseProductionDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new DashboardReadError(400, "Select a valid production date.")
  const day = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value)
    throw new DashboardReadError(400, "Select a valid production date.")
  return day
}

function validateShift(productionDate: unknown, shift: unknown, now: Date) {
  if (typeof productionDate !== "string" || !isCncShift(shift))
    throw new DashboardReadError(400, "Select a valid production date and shift.")
  parseProductionDate(productionDate)
  if (productionShiftEndInstant({ productionDate, shift, productionFloorCode: floor }) > now)
    throw new DashboardReadError(400, "This shift has not ended yet.")
  return { productionDate, shift }
}

function reviewQueuePage(params: URLSearchParams, latestDate: string, now: Date) {
  const date = params.get("date")
  const shift = params.get("shift")
  if (shift !== null && !isCncShift(shift))
    throw new DashboardReadError(400, "Select a valid shift.")

  const olderDate = params.get("olderDate") ?? latestDate
  const day = parseProductionDate(date ?? (olderDate < latestDate ? olderDate : latestDate))
  const dates: string[] = []
  for (let index = 0; index < (date ? 1 : queuePageDays); index++) {
    const productionDate = day.toISOString().slice(0, 10)
    if (!date && productionDate < firstReviewDate) break
    dates.push(productionDate)
    day.setUTCDate(day.getUTCDate() - 1)
  }
  const shifts = shift ? [shift] : [...cncShifts].reverse()
  const keys = dates.flatMap((productionDate) => shifts.map((shift) => ({ productionDate, shift })))
    .filter((key) => productionShiftEndInstant({ ...key, productionFloorCode: floor }) <= now)
  const nextDate = day.toISOString().slice(0, 10)
  return { keys, nextDate: !date && nextDate >= firstReviewDate ? nextDate : null }
}

function errorResponse(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "40001")
    return NextResponse.json({ error: "The records changed. Reload the shift and try again." }, { status: 409 })
  return error instanceof DashboardReadError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : NextResponse.json({ error: "Unable to access the shift review. Try again." }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    return await withDashboardReadRepository(request, async ({ organizationId, granted }) => {
      const now = new Date()
      const lastShift = productionShiftAt(floor, new Date(now.getTime() - 8 * 60 * 60 * 1000))!
      const params = request.nextUrl.searchParams
      const repository = createShiftIdleReviewRepository({ connectionString: readAuthEnvironment().connectionString })
      try {
        const canEdit = granted.has(editCapability)
        const headers = { "Cache-Control": "no-store" }
        const read = async (key: ReturnType<typeof validateShift>) => ({
          ...key, ...await repository.read({ ...key, organizationId }), canEdit,
        })
        const view = params.get("view")
        if (view === "queue" || view === "unaccounted") {
          const queue = view === "queue" ? "review" : "unaccounted"
          const { keys, nextDate } = reviewQueuePage(params, lastShift.productionDate, now)
          const reviews = await Promise.all(keys.map(async (key) => {
            const review = await read(key)
            return { ...review, machines: review.machines.filter((machine) => shiftIdleQueue(machine) === queue) }
          }))
          return NextResponse.json({ reviews, nextDate }, { headers })
        }
        const key = params.has("date") || params.has("shift")
          ? validateShift(params.get("date"), params.get("shift"), now)
          : validateShift(lastShift.productionDate, lastShift.shift, now)
        return NextResponse.json(await read(key), { headers })
      } finally {
        await repository.close()
      }
    }, reviewCapability, floor)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin)
      throw new DashboardReadError(403, "Use this action from the application.")
    return await withDashboardReadRepository(request, async ({ organizationId, actorUserId, granted }) => {
      if (!granted.has(editCapability))
        throw new DashboardReadError(403, "You do not have permission to save shift reasons.")
      const raw = await request.text()
      if (raw.length > 65536) throw new DashboardReadError(413, "Request is too large.")
      let body: unknown
      try {
        body = JSON.parse(raw)
      } catch {
        throw new DashboardReadError(400, "Invalid shift review.")
      }
      if (!body || typeof body !== "object") throw new DashboardReadError(400, "Invalid shift review.")
      const { productionDate, shift, machineId, reason, note, version } = body as Record<string, unknown>
      const key = validateShift(productionDate, shift, new Date())
      if (typeof machineId !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(machineId))
        throw new DashboardReadError(400, "Select a valid machine.")
      if (!isShiftIdleReason(reason)) throw new DashboardReadError(400, "Select an idle reason.")
      if (typeof note !== "string" || note.trim().length > 500)
        throw new DashboardReadError(400, "Use up to 500 characters for the note.")
      if (reason === "other" && !note.trim()) throw new DashboardReadError(400, "Describe the reason in the note.")
      if (typeof version !== "string" || !version)
        throw new DashboardReadError(400, "Reload the review and try again.")
      const repository = createShiftIdleReviewRepository({ connectionString: readAuthEnvironment().connectionString })
      try {
        const reviews = await repository.save({
          ...key, organizationId, actorUserId, machineId, reason, note: note.trim() || null, version,
        })
        if (!reviews)
          throw new DashboardReadError(409, "This machine's review or production record changed. Reload the shift and try again.")
        return NextResponse.json({ reviews })
      } finally {
        await repository.close()
      }
    }, reviewCapability, floor)
  } catch (error) {
    return errorResponse(error)
  }
}
