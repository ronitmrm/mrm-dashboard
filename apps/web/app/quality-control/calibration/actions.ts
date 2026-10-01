"use server"

import { createHash } from "node:crypto"
import { createArtifactService, createStoreRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { signedInPerformer } from "@/lib/auth/signed-in-machinist"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import {
  consumePendingArtifactUpload,
  pendingUploadAuthorizationForUser,
  pendingUploadId,
} from "@/lib/pending-artifact-upload-server"

const path = "/quality-control/calibration"

function required(data: FormData, key: string) {
  const value = data.get(key)?.toString().trim()
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`)
  return value
}

function optional(data: FormData, key: string) {
  return data.get(key)?.toString().trim() || null
}

async function withCalibration<T>(operation: (
  repository: ReturnType<typeof createStoreRepository>,
  actorUserId: string,
  actorUserName: string,
  organizationId: string
) => Promise<T>) {
  const session = await requireCapability("quality.control.calibration.write", path)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return await operation(repository, session.user.id, session.user.name, organizationId)
  } finally {
    await repository.close()
  }
}

function refresh(unitId: string) {
  revalidatePath(path)
  revalidatePath("/iso-document/calibration-plan")
  revalidatePath(`/store/assets/${encodeURIComponent(unitId)}`)
  revalidatePath("/store/orders")
}

async function performer(input: {
  actorUserId: string
  actorUserName: string
  organizationId: string
}) {
  const person = await signedInPerformer({
    connectionString: readAuthEnvironment().connectionString,
    organizationId: input.organizationId,
    userId: input.actorUserId,
    userName: input.actorUserName,
  })
  if (!person) throw new Error("Your account needs a name to record calibration.")
  return [person.code, person.name].filter(Boolean).join(" - ")
}

export async function assignCalibrationScheduleAction(data: FormData) {
  const unitId = required(data, "unit_id")
  await withCalibration((repository, actorUserId, _name, organizationId) =>
    repository.scheduleAssetMaintenance({
      actorUserId,
      assetCode: unitId,
      firstDueOn: required(data, "first_due_on"),
      frequencyDays: Number(required(data, "frequency_days")),
      name: required(data, "schedule_name"),
      organizationId,
      scheduleType: "CALIBRATION",
    })
  )
  refresh(unitId)
}

export async function openCalibrationVisitAction(data: FormData) {
  const unitId = required(data, "unit_id")
  const method = required(data, "method")
  if (method !== "IN_HOUSE" && method !== "SUPPLIER") {
    throw new Error("Choose a calibration method.")
  }
  const visit = await withCalibration((repository, actorUserId, _name, organizationId) =>
    repository.openCalibrationVisit({
      actorUserId,
      assetCode: unitId,
      method,
      organizationId,
      scheduleId: required(data, "schedule_id"),
      scope: required(data, "scope"),
    })
  )
  refresh(unitId)
  const show = data.get("show") === "all" ? "show=all&" : ""
  redirect(`${path}?${show}work=${encodeURIComponent(visit.id)}&unit=${encodeURIComponent(unitId)}`)
}

export async function cancelCalibrationVisitAction(data: FormData) {
  const unitId = required(data, "unit_id")
  const method = required(data, "method")
  if (method !== "IN_HOUSE" && method !== "SUPPLIER") {
    throw new Error("Choose a calibration method.")
  }
  await withCalibration((repository, actorUserId, _name, organizationId) =>
    repository.cancelCalibrationVisit({
      actorUserId,
      method,
      organizationId,
      visitId: required(data, "visit_id"),
    })
  )
  refresh(unitId)
}

export async function dispatchCalibrationVisitAction(data: FormData) {
  const unitId = required(data, "unit_id")
  await withCalibration(async (repository, actorUserId, actorUserName, organizationId) => {
    await repository.finalizeCalibrationDispatch({
      actorUserId,
      movedBy: await performer({ actorUserId, actorUserName, organizationId }),
      organizationId,
      visitId: required(data, "visit_id"),
    })
  })
  refresh(unitId)
}

export async function returnCalibrationVisitAction(data: FormData) {
  const unitId = required(data, "unit_id")
  await withCalibration(async (repository, actorUserId, actorUserName, organizationId) => {
    await repository.returnCalibrationVisit({
      actorUserId,
      movedBy: await performer({ actorUserId, actorUserName, organizationId }),
      organizationId,
      remark: optional(data, "remark"),
      returnedOn: required(data, "returned_on"),
      visitId: required(data, "visit_id"),
    })
  })
  refresh(unitId)
}

async function saveCertificate(input: {
  actorUserId: string
  organizationId: string
  visitId: string
  uploadId: string
}) {
  const authorization = await pendingUploadAuthorizationForUser(input.actorUserId)
  const artifacts = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createGoogleCloudArtifactProvider(),
  })
  try {
    return await consumePendingArtifactUpload({
      authorization,
      expectedIntent: { kind: "store-calibration-certificate" as const, visitId: input.visitId },
      finalize: async (source) => {
        const sha256 = createHash("sha256").update(source.bytes).digest("hex")
        const artifact = await artifacts.store({
          actorUserId: input.actorUserId,
          authorizeTarget: async (client) => {
            const visit = await client.query<{ id: string }>(
              `SELECT id FROM store.calibration_visits
               WHERE id = $1 AND organization_id = $2
                 AND (status = 'RETURNED' OR
                   (status = 'OPEN' AND method = 'IN_HOUSE'))
               FOR KEY SHARE`,
              [input.visitId, input.organizationId]
            )
            if (!visit.rows[0]) throw new Error("Calibration visit is not ready for a certificate.")
          },
          bytes: source.bytes,
          fileName: source.fileName,
          idempotencyKey: ["calibration-certificate", input.visitId, source.fileName, sha256].join(":"),
          mediaType: source.mediaType,
          organizationId: input.organizationId,
          origin: "uploaded",
          pendingUploadId: source.pendingUploadId,
          purpose: "calibration_certificate",
          target: { id: input.visitId, schema: "store", table: "calibration_visits" },
        })
        return {
          binding: {
            artifactId: artifact.id,
            purpose: "calibration_certificate",
            target: { id: input.visitId, schema: "store", table: "calibration_visits" },
          },
          value: artifact.id,
        }
      },
      recover: (binding) => binding.artifactId,
      uploadId: input.uploadId,
    })
  } finally {
    await artifacts.close()
  }
}

export async function signOffCalibrationVisitAction(data: FormData) {
  const unitId = required(data, "unit_id")
  const visitId = required(data, "visit_id")
  const method = required(data, "method")
  const result = required(data, "result")
  if (result !== "PASSED" && result !== "FAILED") throw new Error("Choose Passed or Failed.")
  if (method !== "IN_HOUSE" && method !== "SUPPLIER") throw new Error("Choose a calibration method.")
  await withCalibration(async (repository, actorUserId, actorUserName, organizationId) => {
    const uploadId = pendingUploadId(data, "calibration_certificate")
    if (uploadId) {
      const fileId = await saveCertificate({ actorUserId, organizationId, uploadId, visitId })
      await repository.setCalibrationCertificate({ actorUserId, fileId, organizationId, visitId })
    }
    const common = {
      actorUserId,
      certificateNumber: required(data, "certificate_number"),
      completedBy: await performer({ actorUserId, actorUserName, organizationId }),
      completedOn: required(data, "completed_on"),
      organizationId,
      passed: result === "PASSED",
      visitId,
      workDone: optional(data, "work_done"),
    }
    if (method === "IN_HOUSE") {
      await repository.completeInHouseCalibrationVisit({ ...common, scope: required(data, "scope") })
    } else {
      await repository.completeCalibrationVisit({ ...common, result })
    }
  })
  refresh(unitId)
}
