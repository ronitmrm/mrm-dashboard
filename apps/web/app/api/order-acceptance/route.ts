import { isDeepStrictEqual } from "node:util"
import { NextResponse, type NextRequest } from "next/server"
import { createOrderAcceptanceRepository } from "@workspace/db"
import { parseProductionFloorCode } from "@workspace/db/production-floors"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import { productionFloorPageCapability } from "@/lib/auth/production-floor-capabilities"
import { productionFloorTaskCapability } from "@/lib/auth/production-floor-task-capabilities"
import {
  withDashboardReadRepository,
  DashboardReadError,
} from "@/lib/postgres-dashboard-read-server"
import {
  calculateProposal,
  validateProposal,
  type ProposalInput,
} from "@/lib/order-acceptance"
import { proposalContext, record } from "@/lib/order-acceptance-context"

function inputFrom(value: unknown): ProposalInput {
  const body = record(value)
  const string = (value: unknown) =>
    typeof value === "string" ? value.trim() : ""
  const input: ProposalInput = {
    reference: string(body.reference),
    revisionOf: string(body.revisionOf),
    startDate: string(body.startDate),
    deadline: string(body.deadline),
    mode: body.mode === "deadline" ? "deadline" : "dates",
    hoursPerDay: Number(body.hoursPerDay),
    efficiency: Number(body.efficiency),
    dispatchDays: Number(body.dispatchDays),
    setupHours: Number(body.setupHours),
    existingRmDates: Object.fromEntries(
      Object.entries(record(body.existingRmDates)).map(([id, date]) => [
        id,
        string(date),
      ])
    ),
    lines: Array.isArray(body.lines)
      ? body.lines.map((value) => {
          const line = record(value)
          return {
            id: string(line.id),
            part: string(line.part),
            option: string(line.option),
            quantity: Number(line.quantity),
            rmDate: string(line.rmDate),
          }
        })
      : [],
  }
  validateProposal(input)
  return input
}

async function handle(request: NextRequest) {
  try {
    const floor = parseProductionFloorCode(
      request.nextUrl.searchParams.get("floor")
    )
    if (!floor)
      return NextResponse.json(
        { error: "Select a production unit." },
        { status: 400 }
      )
    return await withDashboardReadRepository(
      request,
      async ({ organizationId, actorUserId, repository: dashboard }) => {
        const repository = createOrderAcceptanceRepository({
          connectionString: readAuthEnvironment().connectionString,
        })
        try {
          if (request.method === "GET") {
            const id = request.nextUrl.searchParams.get("id")
            if (id)
              return NextResponse.json({
                proposal: await repository.get(organizationId, floor, id),
              })
            const snapshot = await dashboard.latest(organizationId, {}, floor)
            const { context } = proposalContext(snapshot)
            return NextResponse.json({
              proposals: await repository.list(organizationId, floor),
              context,
            })
          }
          const writeCapability = productionFloorTaskCapability(
            floor,
            "order_acceptance"
          )
          const granted = await listGrantedCapabilities(actorUserId, [
            writeCapability,
          ])
          if (!granted.includes(writeCapability))
            return NextResponse.json(
              {
                error: "You do not have permission to manage Proposed Orders.",
              },
              { status: 403 }
            )
          const raw = await request.text()
          if (raw.length > 1500000)
            return NextResponse.json(
              { error: "Proposal upload is too large." },
              { status: 413 }
            )
          const body = record(JSON.parse(raw))
          if (!["save", "calculate", "approve"].includes(String(body.action)))
            throw new Error("Invalid proposal action.")
          const input = inputFrom(body.input)
          const id = typeof body.id === "string" ? body.id : undefined
          let result = null
          if (body.action !== "save") {
            const status = await dashboard.status(organizationId)
            if (status.isRefreshing || status.lastError)
              throw new Error(
                "Wait for a successful production-plan refresh before calculating or approving."
              )
            const snapshot = await dashboard.latest(organizationId, {}, floor)
            if (!snapshot) throw new Error("Refresh the production plan first.")
            const { context, resolve } = proposalContext(
              snapshot,
              input.startDate
            )
            result = calculateProposal(input, context, input.lines.map(resolve))
            if (body.action === "approve") {
              const saved = id
                ? await repository.get(organizationId, floor, id)
                : null
              if (
                !saved?.result ||
                !isDeepStrictEqual(saved.input, input) ||
                !isDeepStrictEqual(saved.result, result)
              )
                throw new Error(
                  "Inputs or workload changed. Calculate and review again before approval."
                )
              if (
                result.blockers.length ||
                !result.lines.some((line) => line.selected)
              )
                throw new Error(
                  "Resolve blockers and select at least one feasible line before approval."
                )
            }
          }
          const proposal = await repository.save({
            organization: organizationId,
            floor,
            actor: actorUserId,
            id,
            version: Number(body.version),
            reference: input.reference,
            revisionOf: input.revisionOf,
            content: input,
            result,
            approve: body.action === "approve",
          })
          return NextResponse.json({ proposal })
        } finally {
          await repository.close()
        }
      },
      productionFloorPageCapability(floor, "productionControlTab"),
      floor
    )
  } catch (error) {
    const status = error instanceof DashboardReadError ? error.status : 400
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process proposal.",
      },
      { status }
    )
  }
}
export const GET = handle
export const POST = handle
