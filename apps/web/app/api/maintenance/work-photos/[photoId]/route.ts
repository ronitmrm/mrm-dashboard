import { createMaintenanceWorkPhotoRepository } from "@workspace/db"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { parseMaintenanceWorkPhotoTarget } from "@/lib/maintenance-work-photo-target"

export async function GET(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  await requireCapability("maintenance.workspace.read", "/?tab=maintenanceTab")
  let target
  try {
    target = parseMaintenanceWorkPhotoTarget(Object.fromEntries(new URL(request.url).searchParams))
  } catch {
    return new Response("Maintenance photo target is invalid.", { status: 400 })
  }
  const { photoId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId)) {
    return new Response("Maintenance photo was not found.", { status: 404 })
  }
  const repository = createMaintenanceWorkPhotoRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const photo = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const resolved = await repository.resolveTarget(organizationId, target)
    return resolved ? repository.getPhoto(organizationId, resolved, photoId) : null
  })().finally(() => repository.close())
  if (!photo) return new Response("Maintenance photo was not found.", { status: 404 })
  if (!photo.available) return new Response("Maintenance photo is unavailable.", { status: 410 })
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
