import { createHash } from "node:crypto"

import {
  authorizeMaintenanceWorkPhotoTarget,
  createArtifactService,
  createMaintenanceWorkPhotoRepository,
} from "@workspace/db"
import { NextResponse } from "next/server"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import {
  maintenanceWorkPhotoQuery,
  parseMaintenanceWorkPhotoTarget,
} from "@/lib/maintenance-work-photo-target"
import {
  consumePendingArtifactUpload,
  pendingUploadAuthorizationForUser,
  preparePendingArtifactUploadForFinalAction,
} from "@/lib/pending-artifact-upload-server"

const returnPath = "/?tab=maintenanceTab"

export async function GET(request: Request) {
  await requireCapability("maintenance.workspace.read", returnPath)
  try {
    const target = parseMaintenanceWorkPhotoTarget(Object.fromEntries(new URL(request.url).searchParams))
    const repository = createMaintenanceWorkPhotoRepository({
      connectionString: readAuthEnvironment().connectionString,
    })
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const resolved = await repository.resolveTarget(organizationId, target)
      if (!resolved) return NextResponse.json({ photos: [] })
      const photos = await repository.listPhotos(organizationId, resolved)
      const query = maintenanceWorkPhotoQuery(target)
      return NextResponse.json({ photos: photos.map(({ fileName, id }) => ({
        fileName, id, url: `/api/maintenance/work-photos/${id}?${query}`,
      })) })
    } finally {
      await repository.close()
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Maintenance photos could not be loaded." }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const session = await requireCapability("maintenance.tasks.write", returnPath)
  try {
    const body = (await request.json()) as Record<string, unknown>
    const target = parseMaintenanceWorkPhotoTarget(body.target)
    const uploadIds = body.uploadIds
    if (!Array.isArray(uploadIds) || uploadIds.length < 1 || uploadIds.length > 8 ||
      uploadIds.some((id) => typeof id !== "string") ||
      new Set(uploadIds).size !== uploadIds.length) {
      throw new Error("Select one to eight maintenance photos.")
    }
    const authorization = await pendingUploadAuthorizationForUser(session.user.id)
    const repository = createMaintenanceWorkPhotoRepository({
      connectionString: readAuthEnvironment().connectionString,
    })
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const resolved = await repository.resolveTarget(organizationId, target)
      if (!resolved) throw new Error("Save the maintenance work before adding photos.")
      const completedReport = await repository.completedReport(organizationId, resolved)
      const reason = typeof body.reason === "string" ? body.reason.trim() : ""
      if (completedReport && (!reason || reason.length > 500)) {
        throw new Error("Enter an edit reason (up to 500 characters) before adding photos to a completed report.")
      }
      const existing = await repository.listPhotos(organizationId, resolved)
      if (existing.length + uploadIds.filter((id) => !existing.some((photo) => photo.purpose === `work-photo:${id}`)).length > 8) {
        throw new Error("Attach no more than eight photos to this maintenance job.")
      }
      for (const [index, uploadId] of uploadIds.entries()) {
        await preparePendingArtifactUploadForFinalAction({
          authorization,
          expectedIntent: { index: index + 1, kind: "maintenance-work-photo" },
          allowFinalizedBinding: { purpose: `work-photo:${uploadId}`, target: resolved },
          uploadId,
        })
      }
      const artifacts = createArtifactService({
        connectionString: readAuthEnvironment().connectionString,
        provider: createGoogleCloudArtifactProvider(),
      })
      try {
        for (const [index, uploadId] of uploadIds.entries()) {
          const purpose = `work-photo:${uploadId}`
          await consumePendingArtifactUpload({
            authorization,
            expectedIntent: { index: index + 1, kind: "maintenance-work-photo" },
            finalize: async (photo) => {
              const sha256 = createHash("sha256").update(photo.bytes).digest("hex")
              const artifact = await artifacts.store({
                actorUserId: session.user.id,
                authorizeTarget: (client) => authorizeMaintenanceWorkPhotoTarget(client, organizationId, resolved),
                bytes: photo.bytes,
                fileName: photo.fileName,
                idempotencyKey: ["maintenance-work-photo", resolved.id, uploadId, sha256].join(":"),
                mediaType: photo.mediaType,
                organizationId,
                origin: "uploaded",
                pendingUploadId: photo.pendingUploadId,
                purpose,
                target: resolved,
              })
              return { binding: { artifactId: artifact.id, purpose, target: resolved }, value: undefined }
            },
            recover: () => undefined,
            uploadId,
          })
          if (completedReport) {
            await repository.recordCompletedPhotoAddition({
              actorUserId: session.user.id,
              organizationId,
              reason,
              report: completedReport,
              uploadId,
            })
          }
        }
      } finally {
        await artifacts.close()
      }
      const photos = await repository.listPhotos(organizationId, resolved)
      const query = maintenanceWorkPhotoQuery(target)
      return NextResponse.json({ photos: photos.map(({ fileName, id }) => ({
        fileName, id, url: `/api/maintenance/work-photos/${id}?${query}`,
      })) })
    } finally {
      await repository.close()
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Maintenance photos could not be saved." }, { status: 400 })
  }
}
