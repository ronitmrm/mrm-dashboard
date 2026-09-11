"use server"

import { createHash } from "node:crypto"

import {
  authorizeMaintenanceRequestPhotoTarget,
  createArtifactService,
  createMaintenanceRequestRepository,
} from "@workspace/db"
import {
  maintenanceCategories,
  maintenancePriorities,
  type MaintenanceCategory,
  type MaintenancePriority,
} from "@workspace/db/maintenance-request-domain"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { maintenanceCapabilities } from "@/lib/auth/maintenance-capabilities"
import {
  requireAuthenticatedSession,
  requireCapability,
} from "@/lib/auth/require-capability"
import { requiredText } from "@/lib/form-data"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import {
  consumePendingArtifactUpload,
  pendingUploadAuthorizationForUser,
  pendingUploadIds,
  preparePendingArtifactUploadForFinalAction,
} from "@/lib/pending-artifact-upload-server"

const requestsPath = "/maintenance/requests"
const maximumPhotoCount = 8

function category(value: FormDataEntryValue | null): MaintenanceCategory {
  const result = String(value ?? "")
  if (!maintenanceCategories.includes(result as MaintenanceCategory)) {
    throw new Error("Maintenance category is invalid.")
  }
  return result as MaintenanceCategory
}

function priority(value: FormDataEntryValue | null): MaintenancePriority {
  const result = String(value ?? "")
  if (!maintenancePriorities.includes(result as MaintenancePriority)) {
    throw new Error("Maintenance priority is invalid.")
  }
  return result as MaintenancePriority
}

export async function submitMaintenanceRequestAction(formData: FormData) {
  const session = await requireAuthenticatedSession(requestsPath)
  const uploadIds = pendingUploadIds(formData, "photos")
  if (uploadIds.length > maximumPhotoCount) {
    throw new Error(`Attach no more than ${maximumPhotoCount} photos.`)
  }
  const pendingAuthorization = uploadIds.length
    ? await pendingUploadAuthorizationForUser(session.user.id)
    : null
  if (pendingAuthorization) {
    for (const [index, uploadId] of uploadIds.entries()) {
      await preparePendingArtifactUploadForFinalAction({
        authorization: pendingAuthorization,
        expectedIntent: {
          index: index + 1,
          kind: "maintenance-request-photo",
        },
        uploadId,
      })
    }
  }
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const organizationId = await repository.organizationIdForCode("MRMPL")
  let request: Awaited<ReturnType<typeof repository.submitRequest>>
  try {
    request = await repository.submitRequest({
      department: String(formData.get("department") ?? ""),
      location: requiredText(formData, "location"),
      organizationId,
      problemDescription: requiredText(formData, "problem_description"),
      requestedPriority: priority(formData.get("requested_priority")),
      requesterUserId: session.user.id,
      suggestedCategory: category(formData.get("suggested_category")),
    })
  } finally {
    await repository.close()
  }

  if (uploadIds.length) {
    const artifacts = createArtifactService({
      connectionString: readAuthEnvironment().connectionString,
      provider: createGoogleCloudArtifactProvider(),
    })
    try {
      const retain = async (
        photo: {
          bytes: Buffer
          fileName: string
          mediaType: string
          pendingUploadId?: string
        },
        index: number
      ) => {
        const sha256 = createHash("sha256").update(photo.bytes).digest("hex")
        return artifacts.store({
          actorUserId: session.user.id,
          authorizeTarget: (client, { isRetry }) =>
            authorizeMaintenanceRequestPhotoTarget(
              client,
              {
                organizationId,
                requestId: request.id,
                requesterUserId: session.user.id,
              },
              { requirePendingState: !isRetry }
            ),
          bytes: photo.bytes,
          fileName: photo.fileName,
          idempotencyKey: [
            "maintenance-request-photo",
            request.id,
            index,
            sha256,
          ].join(":"),
          mediaType: photo.mediaType,
          organizationId,
          origin: "uploaded",
          pendingUploadId: photo.pendingUploadId,
          purpose: `request-photo:${index}`,
          target: { id: request.id, schema: "maintenance", table: "requests" },
        })
      }
      if (pendingAuthorization) {
        for (const [index, uploadId] of uploadIds.entries()) {
          const photoIndex = index + 1
          await consumePendingArtifactUpload({
            authorization: pendingAuthorization,
            expectedIntent: {
              index: photoIndex,
              kind: "maintenance-request-photo",
            },
            finalize: async (photo) => {
              const artifact = await retain(photo, photoIndex)
              return {
                binding: {
                  artifactId: artifact.id,
                  purpose: `request-photo:${photoIndex}`,
                  target: {
                    id: request.id,
                    schema: "maintenance",
                    table: "requests",
                  },
                },
                value: undefined,
              }
            },
            recover: () => undefined,
            uploadId,
          })
        }
      }
    } finally {
      await artifacts.close()
    }
  }

  revalidatePath(requestsPath)
  revalidatePath("/maintenance/approval")
  redirect(requestsPath)
}

export async function reviewMaintenanceRequestAction(formData: FormData) {
  const session = await requireCapability(
    maintenanceCapabilities.manager,
    "/maintenance/approval"
  )
  const action = requiredText(formData, "action")
  if (!["approve", "reject", "return"].includes(action)) {
    throw new Error("Maintenance review action is invalid.")
  }
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    await repository.reviewRequest({
      action: action as "approve" | "reject" | "return",
      actorUserId: session.user.id,
      category: category(formData.get("final_category")),
      note: String(formData.get("manager_note") ?? ""),
      organizationId,
      priority: priority(formData.get("final_priority")),
      requestId: requiredText(formData, "request_id"),
    })
  } finally {
    await repository.close()
  }
  revalidatePath("/maintenance", "layout")
}

export async function updateMaintenanceTradeStatusAction(formData: FormData) {
  const trade = category(formData.get("trade"))
  const action = requiredText(formData, "action")
  if (!["start", "complete"].includes(action)) {
    throw new Error("Maintenance work action is invalid.")
  }
  const returnPath =
    trade === "Mechanical"
      ? "/?tab=maintenanceTab"
      : `/maintenance/${trade.toLowerCase()}`
  const session = await requireCapability(
    maintenanceCapabilities.trades[trade],
    returnPath
  )
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await repository.updateTradeStatus({
      action: action as "start" | "complete",
      actorUserId: session.user.id,
      organizationId: await repository.organizationIdForCode("MRMPL"),
      requestId: requiredText(formData, "request_id"),
      trade,
    })
  } finally {
    await repository.close()
  }
  revalidatePath("/maintenance", "layout")
  revalidatePath("/")
}

export async function closeMaintenanceRequestAction(formData: FormData) {
  const session = await requireCapability(
    maintenanceCapabilities.manager,
    requestsPath
  )
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await repository.closeRequest({
      actorUserId: session.user.id,
      organizationId: await repository.organizationIdForCode("MRMPL"),
      requestId: requiredText(formData, "request_id"),
    })
  } finally {
    await repository.close()
  }
  revalidatePath("/maintenance", "layout")
}
