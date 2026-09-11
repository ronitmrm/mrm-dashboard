import { createMaintenanceRequestRepository } from "@workspace/db"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { maintenanceCapabilities } from "@/lib/auth/maintenance-capabilities"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"

const returnPath = "/maintenance/requests"
const tradeCapabilities = [
  ["Electrical", maintenanceCapabilities.trades.Electrical],
  ["Mechanical", maintenanceCapabilities.trades.Mechanical],
  ["Plumbing", maintenanceCapabilities.trades.Plumbing],
] as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const session = await requireAuthenticatedSession(returnPath)
  const granted = await listGrantedCapabilities(session.user.id, [
    maintenanceCapabilities.manager,
    ...tradeCapabilities.map(([, capability]) => capability),
  ])
  const { id, photoId } = await params
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })

  const photo = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const visibleRequests = []
    if (granted.includes(maintenanceCapabilities.manager)) {
      visibleRequests.push(
        repository.listRequests({
          organizationId,
          requestId: id,
          scope: { kind: "manager" },
        })
      )
    }
    for (const [trade, capability] of tradeCapabilities) {
      if (granted.includes(capability)) {
        visibleRequests.push(
          repository.listRequests({
            organizationId,
            requestId: id,
            scope: { kind: "trade", trade },
          })
        )
      }
    }
    try {
      const context = await repository.requesterContext({
        organizationId,
        userId: session.user.id,
      })
      visibleRequests.push(
        repository.listRequests({
          organizationId,
          requestId: id,
          scope: { departments: context.departments, kind: "department" },
        })
      )
    } catch {
      // Capability-only maintenance users need not have an Employee Master link.
    }

    const scopes = await Promise.all(visibleRequests)
    if (!scopes.some((rows) => rows.some((row) => row.id === id))) return null
    return repository.getRequestPhoto({
      organizationId,
      photoId,
      requestId: id,
    })
  })().finally(() => repository.close())

  if (!photo)
    return new Response("Maintenance photo was not found.", { status: 404 })
  if (!photo.available) {
    return new Response("Maintenance photo is unavailable.", { status: 410 })
  }
  try {
    return await createArtifactDeliveryResponse(request, photo, {
      download: new URL(request.url).searchParams.has("download"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Maintenance photo could not be loaded. Please try again.",
      unavailable: "Maintenance photo is unavailable.",
    })
    if (delivery) return delivery
    throw error
  }
}
