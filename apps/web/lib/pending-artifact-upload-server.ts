import "server-only"

import { createHash, randomUUID } from "node:crypto"

import {
  artifactUploadChunkMaxBytes,
  ArtifactStorageError,
  createAuthorizationRepository,
  createPendingArtifactUploadRepository,
  PendingArtifactUploadNotFoundError,
  type ArtifactResumableUploadProvider,
  type PendingArtifactUploadRecord,
  type ServerResumableUploadSession,
} from "@workspace/db"

import {
  pendingUploadIntentEquals,
  type PendingUploadIntent,
  type PendingUploadSafeProgress,
} from "./artifact-upload-contract"
import { getAuth } from "./auth/auth"
import { createGoogleCloudArtifactProvider } from "./google-cloud-artifact-provider"
import {
  authorizePendingUploadIntent,
  normalizePendingUploadMetadata,
  type PendingUploadAuthorization,
  validatePendingUploadBytes,
} from "./pending-artifact-upload-policy"
import { getWebPostgresPool } from "./postgres-runtime"

const uploadLifetimeMilliseconds = 24 * 60 * 60 * 1_000
const uploadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PendingUploadErrorCode =
  | "expired"
  | "forbidden"
  | "integrity_failure"
  | "invalid_request"
  | "not_found"
  | "provider_unavailable"
  | "state_conflict"
  | "unauthenticated"

export class PendingUploadError extends Error {
  constructor(
    readonly code: PendingUploadErrorCode,
    message: string
  ) {
    super(message)
    this.name = "PendingUploadError"
  }
}

function assertUploadId(uploadId: string) {
  if (!uploadIdPattern.test(uploadId)) {
    throw new PendingUploadError("invalid_request", "Upload ID is invalid.")
  }
}

type UploadRepository = ReturnType<typeof createPendingArtifactUploadRepository>

type Dependencies = {
  now?: () => Date
  provider?: ArtifactResumableUploadProvider
  repository?: UploadRepository
}

function dependencies(overrides: Dependencies = {}) {
  return {
    now: overrides.now ?? (() => new Date()),
    provider: overrides.provider ?? createGoogleCloudArtifactProvider(),
    repository:
      overrides.repository ??
      createPendingArtifactUploadRepository({ pool: getWebPostgresPool() }),
  }
}

function session(upload: PendingArtifactUploadRecord) {
  if (!upload.resumableSession) {
    throw new PendingUploadError(
      "state_conflict",
      "Upload session is no longer writable."
    )
  }
  return upload.resumableSession as ServerResumableUploadSession
}

function assertOwner(
  upload: PendingArtifactUploadRecord,
  authorization: PendingUploadAuthorization
) {
  if (upload.ownerUserId !== authorization.userId) {
    throw new PendingUploadError("not_found", "Upload was not found.")
  }
}

function assertNotExpired(upload: PendingArtifactUploadRecord, now: Date) {
  if (upload.expiresAt <= now) {
    throw new PendingUploadError("expired", "Upload has expired.")
  }
}

function assertOwnerAndExpiry(
  upload: PendingArtifactUploadRecord,
  authorization: PendingUploadAuthorization,
  now: Date
) {
  assertOwner(upload, authorization)
  assertNotExpired(upload, now)
}

async function authorizeRecordBeforeLock(
  uploadId: string,
  authorization: PendingUploadAuthorization,
  repository: UploadRepository,
  now: Date
) {
  assertUploadId(uploadId)
  const upload = await repository.get(uploadId)
  if (!upload) {
    throw new PendingUploadError("not_found", "Upload was not found.")
  }
  assertOwnerAndExpiry(upload, authorization, now)
  const client = await getWebPostgresPool().connect()
  let organizationId: string
  try {
    await client.query("BEGIN")
    organizationId = await authorizePendingUploadIntent(
      client,
      upload.intent as PendingUploadIntent,
      authorization
    )
    await client.query("COMMIT")
  } catch {
    await client.query("ROLLBACK").catch(() => undefined)
    throw new PendingUploadError(
      "forbidden",
      "Upload operation is not permitted."
    )
  } finally {
    client.release()
  }
  if (organizationId !== upload.organizationId) {
    throw new PendingUploadError("forbidden", "Upload target has changed.")
  }
  return {
    intent: upload.intent as PendingUploadIntent,
    organizationId,
  }
}

function assertAuthorizedRecord(
  upload: PendingArtifactUploadRecord,
  authorization: PendingUploadAuthorization,
  authorized: {
    intent: PendingUploadIntent
    organizationId: string
  },
  now: Date
) {
  assertOwnerAndExpiry(upload, authorization, now)
  if (upload.organizationId !== authorized.organizationId) {
    throw new PendingUploadError("forbidden", "Upload target has changed.")
  }
  if (
    !pendingUploadIntentEquals(
      upload.intent as PendingUploadIntent,
      authorized.intent
    )
  ) {
    throw new PendingUploadError(
      "state_conflict",
      "Upload intent changed during authorization."
    )
  }
}

function safeProgress(
  upload: PendingArtifactUploadRecord
): PendingUploadSafeProgress {
  const state =
    upload.status === "ready" || upload.status === "finalized"
      ? upload.status
      : upload.status === "rejected" || upload.status === "abandoned"
        ? "abandoned"
        : "uploading"
  return {
    confirmedOffset: upload.confirmedOffset,
    state,
    uploadId: upload.id,
  }
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function exactTemporaryObject(
  provider: ArtifactResumableUploadProvider,
  upload: PendingArtifactUploadRecord
) {
  const temporary = await provider.readTemporary({ key: upload.providerKey })
  if (temporary.bytes.byteLength !== upload.expectedByteSize) {
    throw new PendingUploadError(
      "integrity_failure",
      "Uploaded bytes do not match the expected size."
    )
  }
  return {
    ...temporary,
    sha256: sha256(temporary.bytes),
  }
}

function providerError(error: unknown): never {
  if (error instanceof PendingUploadError) throw error
  if (error instanceof ArtifactStorageError) {
    throw new PendingUploadError(
      error.code === "integrity-failure"
        ? "integrity_failure"
        : error.code === "not-found"
          ? "not_found"
          : "provider_unavailable",
      error.code === "provider-failure"
        ? "Upload storage is temporarily unavailable."
        : "Upload storage state is unavailable."
    )
  }
  throw error
}

async function reconcileUpload(
  provider: ArtifactResumableUploadProvider,
  upload: PendingArtifactUploadRecord,
  save: Parameters<Parameters<UploadRepository["withLockedUpload"]>[1]>[1]
) {
  if (upload.status !== "uploading") return upload
  try {
    const progress = await provider.getResumableStatus({
      expectedByteSize: upload.expectedByteSize,
      session: session(upload),
    })
    return save({
      confirmedOffset: progress.nextOffset,
      status: progress.complete ? "uploaded" : "uploading",
    })
  } catch (error) {
    if (
      !(error instanceof ArtifactStorageError) ||
      error.code !== "not-found"
    ) {
      providerError(error)
    }
    try {
      const temporary = await exactTemporaryObject(provider, upload)
      return save({
        completedByteSize: temporary.bytes.byteLength,
        completedSha256: temporary.sha256,
        confirmedOffset: upload.expectedByteSize,
        resumableSession: null,
        status: "uploaded",
        temporaryGeneration: temporary.generation,
      })
    } catch (temporaryError) {
      if (
        temporaryError instanceof ArtifactStorageError &&
        temporaryError.code === "not-found"
      ) {
        throw new PendingUploadError(
          "not_found",
          "Upload session was not found."
        )
      }
      providerError(temporaryError)
    }
  }
}

export function assertSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin || origin !== new URL(request.url).origin) {
    throw new PendingUploadError(
      "forbidden",
      "Cross-origin upload mutation is not permitted."
    )
  }
}

export async function authenticatePendingUploadRequest(
  requestHeaders: Headers
): Promise<PendingUploadAuthorization> {
  const authenticated = await getAuth().api.getSession({
    headers: requestHeaders,
  })
  if (!authenticated) {
    throw new PendingUploadError("unauthenticated", "Sign in is required.")
  }
  const authorization = createAuthorizationRepository({
    pool: getWebPostgresPool(),
  })
  return {
    grantedCapabilities: new Set(
      await authorization.listAllGrantedCapabilities(authenticated.user.id)
    ),
    userId: authenticated.user.id,
  }
}

export async function pendingUploadAuthorizationForUser(userId: string) {
  const authorization = createAuthorizationRepository({
    pool: getWebPostgresPool(),
  })
  return {
    grantedCapabilities: new Set(
      await authorization.listAllGrantedCapabilities(userId)
    ),
    userId,
  } satisfies PendingUploadAuthorization
}

export function pendingUploadIds(formData: FormData, fileFieldName: string) {
  return formData
    .getAll(`${fileFieldName}_upload_id`)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
}

export function pendingUploadId(formData: FormData, fileFieldName: string) {
  const ids = pendingUploadIds(formData, fileFieldName)
  if (ids.length > 1) {
    throw new PendingUploadError(
      "invalid_request",
      `Only one upload is allowed for ${fileFieldName}.`
    )
  }
  return ids[0]
}

export async function readBoundedUploadChunk(request: Request) {
  if (!request.body) {
    throw new PendingUploadError("invalid_request", "Upload chunk is required.")
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > artifactUploadChunkMaxBytes) {
        await reader.cancel()
        throw new PendingUploadError(
          "invalid_request",
          "Upload chunk exceeds 4 MiB."
        )
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  if (!size) {
    throw new PendingUploadError("invalid_request", "Upload chunk is empty.")
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size
  )
}

export async function startPendingArtifactUpload(
  input: {
    authorization: PendingUploadAuthorization
    byteSize: unknown
    fileName: unknown
    intent: unknown
    mediaType: unknown
  },
  overrides: Dependencies = {}
) {
  let normalized: ReturnType<typeof normalizePendingUploadMetadata>
  try {
    normalized = normalizePendingUploadMetadata(input)
  } catch (error) {
    throw new PendingUploadError(
      "invalid_request",
      error instanceof Error ? error.message : "Upload request is invalid."
    )
  }
  const pool = getWebPostgresPool()
  const client = await pool.connect()
  let organizationId: string
  try {
    await client.query("BEGIN")
    organizationId = await authorizePendingUploadIntent(
      client,
      normalized.intent,
      input.authorization
    )
    await client.query("COMMIT")
  } catch {
    await client.query("ROLLBACK").catch(() => undefined)
    throw new PendingUploadError(
      "forbidden",
      "Upload operation is not permitted."
    )
  } finally {
    client.release()
  }

  const { now, provider, repository } = dependencies(overrides)
  const id = randomUUID()
  let started: Awaited<ReturnType<typeof provider.startResumable>>
  try {
    started = await provider.startResumable({
      customId: id,
      expectedByteSize: normalized.byteSize,
      mediaType: normalized.mediaType || "application/octet-stream",
    })
  } catch (error) {
    providerError(error)
  }
  try {
    const upload = await repository.create({
      expectedByteSize: normalized.byteSize,
      expiresAt: new Date(now().getTime() + uploadLifetimeMilliseconds),
      id,
      intent: normalized.intent,
      mediaType: normalized.mediaType,
      organizationId,
      originalFileName: normalized.fileName,
      ownerUserId: input.authorization.userId,
      providerKey: started.key,
      resumableSession: started.session,
    })
    return safeProgress(upload)
  } catch (error) {
    await provider
      .cancelResumable({ session: started.session })
      .catch(() => undefined)
    throw error
  }
}

export async function getPendingArtifactUpload(
  uploadId: string,
  authorization: PendingUploadAuthorization,
  overrides: Dependencies = {}
) {
  const { now, provider, repository } = dependencies(overrides)
  const authorized = await authorizeRecordBeforeLock(
    uploadId,
    authorization,
    repository,
    now()
  )
  return repository.withLockedUpload(uploadId, async (upload, save) => {
    assertAuthorizedRecord(upload, authorization, authorized, now())
    return safeProgress(await reconcileUpload(provider, upload, save))
  })
}

export async function appendPendingArtifactUploadChunk(
  input: {
    authorization: PendingUploadAuthorization
    bytes: Buffer
    offset: number
    uploadId: string
  },
  overrides: Dependencies = {}
) {
  if (!Number.isSafeInteger(input.offset) || input.offset < 0) {
    throw new PendingUploadError("invalid_request", "Upload offset is invalid.")
  }
  const { now, provider, repository } = dependencies(overrides)
  const authorized = await authorizeRecordBeforeLock(
    input.uploadId,
    input.authorization,
    repository,
    now()
  )
  return repository.withLockedUpload(input.uploadId, async (upload, save) => {
    assertAuthorizedRecord(upload, input.authorization, authorized, now())
    if (upload.status !== "uploading") {
      throw new PendingUploadError(
        "state_conflict",
        "Upload is not accepting chunks."
      )
    }
    if (input.offset !== upload.confirmedOffset) {
      throw new PendingUploadError(
        "state_conflict",
        `Upload offset mismatch; resume at ${upload.confirmedOffset}.`
      )
    }
    let progress
    try {
      progress = await provider.uploadResumableChunk({
        bytes: input.bytes,
        expectedByteSize: upload.expectedByteSize,
        offset: input.offset,
        session: session(upload),
      })
    } catch (error) {
      if (input.offset + input.bytes.byteLength === upload.expectedByteSize) {
        try {
          const temporary = await exactTemporaryObject(provider, upload)
          const recovered = await save({
            completedByteSize: temporary.bytes.byteLength,
            completedSha256: temporary.sha256,
            confirmedOffset: upload.expectedByteSize,
            resumableSession: null,
            status: "uploaded",
            temporaryGeneration: temporary.generation,
          })
          return safeProgress(recovered)
        } catch {
          // Preserve the original resumable failure when no exact final object exists.
        }
      }
      providerError(error)
    }
    const updated = await save({
      confirmedOffset: progress.nextOffset,
      status: progress.complete ? "uploaded" : "uploading",
    })
    return safeProgress(updated)
  })
}

export async function completePendingArtifactUpload(
  uploadId: string,
  authorization: PendingUploadAuthorization,
  overrides: Dependencies = {}
) {
  const { now, provider, repository } = dependencies(overrides)
  const authorized = await authorizeRecordBeforeLock(
    uploadId,
    authorization,
    repository,
    now()
  )
  const outcome = await repository.withLockedUpload(
    uploadId,
    async (original, save) => {
      assertAuthorizedRecord(original, authorization, authorized, now())
      if (original.status === "ready") {
        return { progress: safeProgress(original) }
      }
      let upload: PendingArtifactUploadRecord
      try {
        upload = await reconcileUpload(provider, original, save)
      } catch (error) {
        if (
          !(error instanceof PendingUploadError) ||
          error.code !== "integrity_failure"
        ) {
          throw error
        }
        await save({ cleanupError: null, status: "rejected" })
        return { error }
      }
      if (upload.status !== "uploaded") {
        throw new PendingUploadError(
          "state_conflict",
          "Upload bytes are incomplete."
        )
      }
      let temporary: Awaited<ReturnType<typeof exactTemporaryObject>>
      try {
        temporary = await exactTemporaryObject(provider, upload)
        validatePendingUploadBytes({
          bytes: temporary.bytes,
          fileName: upload.originalFileName,
          intent: upload.intent as PendingUploadIntent,
          mediaType: upload.mediaType,
        })
      } catch (error) {
        const contentFailure =
          !(error instanceof ArtifactStorageError) ||
          error.code === "integrity-failure"
        if (!contentFailure) providerError(error)
        await save({ cleanupError: null, status: "rejected" })
        return {
          error: new PendingUploadError(
            "integrity_failure",
            error instanceof Error ? error.message : "Upload validation failed."
          ),
        }
      }
      upload = await save({
        completedByteSize: temporary.bytes.byteLength,
        completedSha256: temporary.sha256,
        confirmedOffset: upload.expectedByteSize,
        resumableSession: null,
        status: "ready",
        temporaryGeneration: temporary.generation,
      })
      return { progress: safeProgress(upload) }
    }
  )
  if ("error" in outcome) throw outcome.error
  return outcome.progress
}

export async function abandonPendingArtifactUpload(
  uploadId: string,
  authorization: PendingUploadAuthorization,
  overrides: Dependencies = {}
) {
  const { now, provider, repository } = dependencies(overrides)
  const authorized = await authorizeRecordBeforeLock(
    uploadId,
    authorization,
    repository,
    now()
  )
  const cleanupError = await repository.withLockedUpload(
    uploadId,
    async (upload, save) => {
      assertAuthorizedRecord(upload, authorization, authorized, now())
      if (upload.status === "finalized") {
        throw new PendingUploadError(
          "state_conflict",
          "Finalized uploads cannot be abandoned."
        )
      }
      try {
        if (upload.resumableSession) {
          await provider.cancelResumable({ session: session(upload) })
        }
        let generation = upload.temporaryGeneration
        if (!generation) {
          generation = await provider
            .readTemporary({ key: upload.providerKey })
            .then((result) => result.generation)
            .catch((error) => {
              if (
                error instanceof ArtifactStorageError &&
                error.code === "not-found"
              ) {
                return null
              }
              throw error
            })
        }
        if (generation) {
          await provider.deleteTemporary({
            generation,
            key: upload.providerKey,
          })
        }
        await save({
          cleanupCompletedAt: now(),
          cleanupError: null,
          resumableSession: null,
          status: "abandoned",
        })
        return null
      } catch {
        await save({
          cleanupError: "Temporary upload cleanup failed.",
          status: "abandoned",
        })
        return "Temporary upload cleanup failed."
      }
    }
  )
  if (cleanupError) {
    throw new PendingUploadError("provider_unavailable", cleanupError)
  }
  return { confirmedOffset: 0, state: "abandoned", uploadId } as const
}

export type FinalizedPendingUpload = {
  artifactId: string
  purpose: string
  target: { id: string; schema: string; table: string }
}

export async function preparePendingArtifactUploadForFinalAction(input: {
  authorization: PendingUploadAuthorization
  allowFinalizedBinding?: Pick<FinalizedPendingUpload, "purpose" | "target">
  expectedIntent: PendingUploadIntent
  uploadId: string
}) {
  assertUploadId(input.uploadId)
  const { now, provider, repository } = dependencies()
  const authorizationClient = await getWebPostgresPool().connect()
  let organizationId: string
  try {
    await authorizationClient.query("BEGIN")
    organizationId = await authorizePendingUploadIntent(
      authorizationClient,
      input.expectedIntent,
      input.authorization,
      { finalizing: true }
    )
    await authorizationClient.query("COMMIT")
  } catch {
    await authorizationClient.query("ROLLBACK").catch(() => undefined)
    throw new PendingUploadError(
      "forbidden",
      "Upload operation is not permitted."
    )
  } finally {
    authorizationClient.release()
  }
  return repository.withLockedUpload(input.uploadId, async (upload) => {
    assertOwner(upload, input.authorization)
    if (upload.organizationId !== organizationId) {
      throw new PendingUploadError("forbidden", "Upload target has changed.")
    }
    if (
      !pendingUploadIntentEquals(
        upload.intent as PendingUploadIntent,
        input.expectedIntent
      )
    ) {
      throw new PendingUploadError(
        "state_conflict",
        "Upload intent does not match this attachment."
      )
    }
    if (upload.status === "finalized") {
      const allowed = input.allowFinalizedBinding
      if (
        allowed &&
        upload.finalTargetSchema === allowed.target.schema &&
        upload.finalTargetTable === allowed.target.table &&
        upload.finalTargetId === allowed.target.id &&
        upload.finalPurpose === allowed.purpose
      ) {
        return
      }
      throw new PendingUploadError(
        "state_conflict",
        "Upload was already finalized for another attachment."
      )
    }
    assertNotExpired(upload, now())
    if (upload.status !== "ready") {
      throw new PendingUploadError("state_conflict", "Upload is not ready.")
    }
    const temporary = await exactTemporaryObject(provider, upload)
    if (
      temporary.generation !== upload.temporaryGeneration ||
      temporary.sha256 !== upload.completedSha256
    ) {
      throw new PendingUploadError(
        "integrity_failure",
        "Uploaded object integrity changed."
      )
    }
    validatePendingUploadBytes({
      bytes: temporary.bytes,
      fileName: upload.originalFileName,
      intent: upload.intent as PendingUploadIntent,
      mediaType: upload.mediaType,
    })
  })
}

export async function consumePendingArtifactUpload<T>(input: {
  authorization: PendingUploadAuthorization
  expectedIntent: PendingUploadIntent
  finalize: (upload: {
    bytes: Buffer
    fileName: string
    mediaType: string
    organizationId: string
    pendingUploadId: string
  }) => Promise<{ binding: FinalizedPendingUpload; value: T }>
  recover: (
    binding: FinalizedPendingUpload & {
      fileName: string
      mediaType: string
    }
  ) => Promise<T> | T
  uploadId: string
}) {
  assertUploadId(input.uploadId)
  const { now, provider, repository } = dependencies()
  const authorizationClient = await getWebPostgresPool().connect()
  let authorizedOrganizationId: string
  try {
    await authorizationClient.query("BEGIN")
    authorizedOrganizationId = await authorizePendingUploadIntent(
      authorizationClient,
      input.expectedIntent,
      input.authorization,
      { finalizing: true }
    )
    await authorizationClient.query("COMMIT")
  } catch {
    await authorizationClient.query("ROLLBACK").catch(() => undefined)
    throw new PendingUploadError(
      "forbidden",
      "Upload operation is not permitted."
    )
  } finally {
    authorizationClient.release()
  }
  const prepared = await repository.withLockedUpload(
    input.uploadId,
    async (upload, _save, client) => {
      assertOwner(upload, input.authorization)
      if (upload.organizationId !== authorizedOrganizationId) {
        throw new PendingUploadError("forbidden", "Upload target has changed.")
      }
      if (
        !pendingUploadIntentEquals(
          upload.intent as PendingUploadIntent,
          input.expectedIntent
        )
      ) {
        throw new PendingUploadError(
          "state_conflict",
          "Upload intent does not match this attachment."
        )
      }
      if (upload.status === "finalized") {
        const target = {
          id: upload.finalTargetId!,
          schema: upload.finalTargetSchema!,
          table: upload.finalTargetTable!,
        }
        const binding = {
          artifactId: upload.finalArtifactId!,
          purpose: upload.finalPurpose!,
          target,
        }
        const retained = await client.query<{ id: string }>(
          `
            SELECT file.id
            FROM core.files file
            JOIN core.file_objects object ON object.id = file.physical_object_id
            JOIN core.file_links link ON link.file_id = file.id
            WHERE file.id = $1 AND file.organization_id = $2
              AND link.target_schema = $3 AND link.target_table = $4
              AND link.target_id = $5 AND link.purpose = $6
          `,
          [
            binding.artifactId,
            upload.organizationId,
            target.schema,
            target.table,
            target.id,
            binding.purpose,
          ]
        )
        if (!retained.rows[0]) {
          throw new PendingUploadError(
            "state_conflict",
            "Bound Artifact was not found."
          )
        }
        return { binding, recovered: true as const, upload }
      }
      assertNotExpired(upload, now())
      if (upload.status !== "ready") {
        throw new PendingUploadError("state_conflict", "Upload is not ready.")
      }
      const temporary = await exactTemporaryObject(provider, upload)
      if (temporary.generation !== upload.temporaryGeneration) {
        throw new PendingUploadError(
          "integrity_failure",
          "Uploaded object generation changed."
        )
      }
      if (sha256(temporary.bytes) !== upload.completedSha256) {
        throw new PendingUploadError(
          "integrity_failure",
          "Uploaded object integrity changed."
        )
      }
      const validated = validatePendingUploadBytes({
        bytes: temporary.bytes,
        fileName: upload.originalFileName,
        intent: upload.intent as PendingUploadIntent,
        mediaType: upload.mediaType,
      })
      return {
        bytes: temporary.bytes,
        fileName: validated.fileName,
        generation: temporary.generation,
        mediaType: validated.mediaType,
        recovered: false as const,
        upload,
      }
    }
  )

  if (prepared.recovered) {
    return input.recover({
      ...prepared.binding,
      fileName: prepared.upload.originalFileName,
      mediaType: prepared.upload.mediaType,
    })
  }

  const finalized = await input.finalize({
    bytes: prepared.bytes,
    fileName: prepared.fileName,
    mediaType: prepared.mediaType,
    organizationId: prepared.upload.organizationId,
    pendingUploadId: input.uploadId,
  })
  const outcome = await repository.withLockedUpload(
    input.uploadId,
    async (upload) => {
      if (
        upload.status !== "finalized" ||
        upload.finalArtifactId !== finalized.binding.artifactId ||
        upload.finalPurpose !== finalized.binding.purpose ||
        upload.finalTargetId !== finalized.binding.target.id ||
        upload.finalTargetSchema !== finalized.binding.target.schema ||
        upload.finalTargetTable !== finalized.binding.target.table
      ) {
        throw new PendingUploadError(
          "state_conflict",
          "Retained artifact did not atomically bind its pending upload."
        )
      }
      return { finalized, generation: prepared.generation, upload }
    }
  )

  try {
    await provider.deleteTemporary({
      generation: outcome.generation,
      key: outcome.upload.providerKey,
    })
    await repository.withLockedUpload(input.uploadId, (_upload, save) =>
      save({ cleanupCompletedAt: now(), cleanupError: null }).then(
        () => undefined
      )
    )
  } catch {
    await repository.withLockedUpload(input.uploadId, (_upload, save) =>
      save({ cleanupError: "Finalized temporary upload cleanup failed." }).then(
        () => undefined
      )
    )
  }
  return outcome.finalized.value
}

export async function cleanupPendingArtifactUploads(
  input: { before: Date; limit: number },
  overrides: Dependencies = {}
) {
  const { provider, repository } = dependencies(overrides)
  const ids = await repository.listCleanupCandidateIds(input)
  let cleaned = 0
  let failed = 0
  for (const id of ids) {
    const result = await repository.withLockedUpload(
      id,
      async (upload, save) => {
        const eligible =
          !upload.cleanupCompletedAt &&
          (upload.status === "finalized" ||
            upload.status === "abandoned" ||
            upload.status === "rejected" ||
            upload.expiresAt <= input.before)
        if (!eligible) return "skipped" as const
        if (!upload.providerKey.startsWith("pending-artifact-uploads/")) {
          await save({
            cleanupError: "Temporary upload key is outside its namespace.",
          })
          return "failed" as const
        }
        try {
          if (upload.status !== "finalized" && upload.resumableSession) {
            await provider.cancelResumable({ session: session(upload) })
          }
          let generation = upload.temporaryGeneration
          if (!generation) {
            generation = await provider
              .readTemporary({ key: upload.providerKey })
              .then((temporary) => temporary.generation)
              .catch((error) => {
                if (
                  error instanceof ArtifactStorageError &&
                  error.code === "not-found"
                ) {
                  return null
                }
                throw error
              })
          }
          if (generation) {
            await provider.deleteTemporary({
              key: upload.providerKey,
              generation,
            })
          }
          await save({
            cleanupCompletedAt: input.before,
            cleanupError: null,
            resumableSession: null,
            status: upload.status === "finalized" ? "finalized" : "abandoned",
          })
          return "cleaned" as const
        } catch {
          await save({ cleanupError: "Temporary upload cleanup failed." })
          return "failed" as const
        }
      }
    )
    if (result === "cleaned") cleaned += 1
    if (result === "failed") failed += 1
  }
  return { candidates: ids.length, cleaned, failed }
}

export function pendingUploadErrorResponse(error: unknown) {
  const known =
    error instanceof PendingUploadError
      ? error
      : error instanceof PendingArtifactUploadNotFoundError
        ? new PendingUploadError("not_found", "Upload was not found.")
        : new PendingUploadError(
            "provider_unavailable",
            "Upload request could not be completed."
          )
  const status: Record<PendingUploadErrorCode, number> = {
    expired: 410,
    forbidden: 403,
    integrity_failure: 422,
    invalid_request: 400,
    not_found: 404,
    provider_unavailable: 503,
    state_conflict: 409,
    unauthenticated: 401,
  }
  return Response.json(
    { error: { code: known.code, message: known.message } },
    { status: status[known.code] }
  )
}
