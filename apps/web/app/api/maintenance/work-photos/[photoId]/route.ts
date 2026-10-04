import { createArtifactService, createMaintenanceWorkPhotoRepository } from "@workspace/db"
import { NextResponse } from "next/server"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import { parseMaintenanceWorkPhotoTarget } from "@/lib/maintenance-work-photo-target"

const photoIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  await requireCapability("maintenance.workspace.read", "/?tab=maintenanceTab")
  let target
  try {
    target = parseMaintenanceWorkPhotoTarget(Object.fromEntries(new URL(request.url).searchParams))
  } catch {
    return new Response("Maintenance photo target is invalid.", { status: 400 })
  }
  const { photoId } = await params
  if (!photoIdPattern.test(photoId)) {
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

export async function DELETE(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const session = await requireCapability("maintenance.tasks.write", "/?tab=maintenanceTab")
  try {
    const target = parseMaintenanceWorkPhotoTarget(Object.fromEntries(new URL(request.url).searchParams))
    const { photoId } = await params
    if (!photoIdPattern.test(photoId)) {
      return NextResponse.json({ error: "Maintenance photo was not found." }, { status: 404 })
    }
    const connectionString = readAuthEnvironment().connectionString
    const repository = createMaintenanceWorkPhotoRepository({ connectionString })
    let organizationId: string
    let fileName: string
    try {
      organizationId = await repository.organizationIdForCode("MRMPL")
      const resolved = await repository.resolveTarget(organizationId, target)
      const photo = resolved ? await repository.getPhoto(organizationId, resolved, photoId) : null
      if (!photo) return NextResponse.json({ error: "Maintenance photo was not found." }, { status: 404 })
      fileName = photo.fileName
    } finally {
      await repository.close()
    }
    const artifacts = createArtifactService({
      connectionString,
      provider: createGoogleCloudArtifactProvider(),
    })
    try {
      await artifacts.delete({
        actorUserId: session.user.id,
        artifactId: photoId,
        confirmation: fileName,
        organizationId,
        reason: "Removed from maintenance work photos.",
      })
    } finally {
      await artifacts.close()
    }
    return NextResponse.json({ removed: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Maintenance photo could not be removed." }, { status: 400 })
  }
}
