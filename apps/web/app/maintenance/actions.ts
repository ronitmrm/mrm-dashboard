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
import { createUploadThingArtifactProvider } from "@/lib/uploadthing-artifact-provider"
import { validateUserAttachment } from "@/lib/user-attachment-security"

const requestsPath = "/maintenance/requests"
const maximumPhotoBytes = 10 * 1024 * 1024
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

function requestPhotos(formData: FormData) {
  const files = formData
    .getAll("photos")
    .filter((file): file is File => file instanceof File && file.size > 0)
  if (files.length > maximumPhotoCount) {
    throw new Error(`Attach no more than ${maximumPhotoCount} photos.`)
  }
  return files.map((file) => {
    if (file.size > maximumPhotoBytes) {
      throw new Error("Each Maintenance photo must be 10 MB or smaller.")
    }
    return file
  })
}

export async function submitMaintenanceRequestAction(formData: FormData) {
  const session = await requireAuthenticatedSession(requestsPath)
  const files = requestPhotos(formData)
  const preparedPhotos = await Promise.all(
    files.map(async (file) => {
      const bytes = Buffer.from(await file.arrayBuffer())
      return {
        bytes,
        ...validateUserAttachment({
          bytes,
          fileName: file.name,
          purpose: "maintenance-photo",
        }),
      }
    })
  )
  const repository = createMaintenanceRequestRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const organizationId = await repository.organizationIdForCode("MRMPL")
  let request: Awaited<ReturnType<typeof repository.submitRequest>>
  try {
    request = await repository.submitRequest({
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

  if (preparedPhotos.length) {
    const artifacts = createArtifactService({
      connectionString: readAuthEnvironment().connectionString,
      provider: createUploadThingArtifactProvider(),
    })
    try {
      for (const [index, photo] of preparedPhotos.entries()) {
        const sha256 = createHash("sha256").update(photo.bytes).digest("hex")
        await artifacts.store({
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
            index + 1,
            sha256,
          ].join(":"),
          mediaType: photo.mediaType,
          organizationId,
          origin: "uploaded",
          purpose: `request-photo:${index + 1}`,
          target: { id: request.id, schema: "maintenance", table: "requests" },
        })
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
