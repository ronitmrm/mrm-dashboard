import { NextResponse } from "next/server"

import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { signedInPerformer } from "@/lib/auth/signed-in-machinist"

const returnPath = "/?tab=maintenanceTab"

export async function GET() {
  await requireCapability("maintenance.workspace.read", returnPath)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return NextResponse.json(await repository.listBreakdownAssets(organizationId))
  } finally {
    await repository.close()
  }
}

export async function POST(request: Request) {
  const session = await requireCapability("maintenance.tasks.write", returnPath)
  const body = (await request.json()) as Record<string, unknown>
  if (body.action !== "start" && body.action !== "complete") {
    return NextResponse.json({ error: "Invalid breakdown action." }, { status: 400 })
  }
  const connectionString = readAuthEnvironment().connectionString
  const repository = createStoreRepository({ connectionString })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const required = (value: unknown, label: string) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} is required.`)
      }
      return value.trim()
    }
    try {
      if (body.action === "start") {
        await repository.startAssetBreakdown({
          actorUserId: session.user.id,
          assetCode: required(body.assetCode, "Unit ID"),
          organizationId,
          reasonCode: required(body.reasonCode, "Reason code"),
          reasonName: required(body.reasonName, "Reason"),
          remark: typeof body.remark === "string" ? body.remark : null,
          startedAt: required(body.startedAt, "Start time"),
        })
      } else {
        const performer = await signedInPerformer({
          connectionString,
          organizationId,
          userId: session.user.id,
          userName: session.user.name,
        })
        if (!performer) {
          return NextResponse.json(
            { error: "Your signed-in account needs a name to complete maintenance work." },
            { status: 403 }
          )
        }
        await repository.completeAssetBreakdown({
          actorUserId: session.user.id,
          breakdownId: required(body.breakdownId, "Breakdown"),
          changedItems: Array.isArray(body.changedItems)
            ? body.changedItems.filter((item): item is string => typeof item === "string")
            : [],
          completedAt: required(body.completedAt, "Completion time"),
          completedBy: performer.name,
          completedByEmployeeCode: performer.code || null,
          organizationId,
          remark: typeof body.remark === "string" ? body.remark : null,
          workDone: required(body.workDone, "Work done"),
        })
      }
      return NextResponse.json({ ok: true })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Breakdown failed." },
        { status: 400 }
      )
    }
  } finally {
    await repository.close()
  }
}
