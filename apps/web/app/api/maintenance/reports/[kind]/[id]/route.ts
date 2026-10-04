import { createMaintenanceReportCorrectionRepository } from "@workspace/db"
import { NextResponse } from "next/server"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: {
  params: Promise<{ kind: string; id: string }>
}) {
  const session = await requireCapability("maintenance.tasks.write", "/iso-document/machine-maintenance-register")
  try {
    const { kind, id } = await params
    if ((kind !== "machine" && kind !== "asset") || !uuid.test(id)) {
      return NextResponse.json({ error: "Maintenance report was not found." }, { status: 404 })
    }
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body.reason !== "string" || typeof body.workDone !== "string" ||
      typeof body.remark !== "string" || !Array.isArray(body.changedItems) ||
      body.changedItems.some((item) => typeof item !== "string") ||
      !Array.isArray(body.checklistSteps)) {
      throw new Error("Report changes are invalid.")
    }
    if (!body.reason.trim() || body.reason.length > 500) {
      throw new Error("Enter an edit reason (up to 500 characters).")
    }
    const checklistSteps = body.checklistSteps.map((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Checklist changes are invalid.")
      }
      const step = value as Record<string, unknown>
      if ((step.id !== null && (typeof step.id !== "string" || !uuid.test(step.id))) ||
        !Number.isInteger(step.sequence) || typeof step.value !== "string" ||
        typeof step.remark !== "string" || step.value.length > 1000 ||
        step.remark.length > 1000) {
        throw new Error("Checklist changes are invalid.")
      }
      return { id: step.id as string | null, sequence: step.sequence as number,
        value: step.value, remark: step.remark }
    })
    const repository = createMaintenanceReportCorrectionRepository({
      connectionString: readAuthEnvironment().connectionString,
    })
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      await repository.correct({
        actorUserId: session.user.id,
        changedItems: body.changedItems as string[],
        checklistSteps,
        kind,
        organizationId,
        reason: body.reason,
        remark: body.remark,
        reportId: id,
        workDone: body.workDone,
      })
      return NextResponse.json({ saved: true })
    } finally {
      await repository.close()
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Report changes could not be saved." }, { status: 400 })
  }
}
