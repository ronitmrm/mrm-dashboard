import { NextResponse } from "next/server"

import { createMaintenanceRequestRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { maintenanceCapabilities } from "@/lib/auth/maintenance-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

const returnPath = "/?tab=maintenanceTab"

export async function GET() {
  await requireCapability(maintenanceCapabilities.trades.Mechanical, returnPath)
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const rows = await repository.listRequests({
      organizationId,
      scope: { kind: "trade", trade: "Mechanical" },
    })
    return NextResponse.json({ rows })
  } finally {
    await repository.close()
  }
}

export async function POST(request: Request) {
  const session = await requireCapability(
    maintenanceCapabilities.trades.Mechanical,
    returnPath
  )
  const body = (await request.json()) as {
    action?: unknown
    requestId?: unknown
  }
  if (body.action !== "start" && body.action !== "complete") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  }
  if (typeof body.requestId !== "string" || !body.requestId.trim()) {
    return NextResponse.json(
      { error: "Request ID is required." },
      { status: 400 }
    )
  }
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await repository.updateTradeStatus({
      action: body.action,
      actorUserId: session.user.id,
      organizationId: await repository.organizationIdForCode("MRMPL"),
      requestId: body.requestId,
      trade: "Mechanical",
    })
    return NextResponse.json({ ok: true })
  } finally {
    await repository.close()
  }
}
