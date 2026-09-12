import "server-only"

import { createHash } from "node:crypto"

import { Storage, type StorageOptions } from "@google-cloud/storage"
import { getVercelOidcToken } from "@vercel/oidc"
import {
  artifactUploadChunkMaxBytes,
  ArtifactStorageError,
  type ArtifactResumableUploadProgress,
  type ArtifactResumableUploadProvider,
  type ArtifactStorageProvider,
  type ServerResumableUploadSession,
} from "@workspace/db"
import {
  ExternalAccountClient,
  type IdentityPoolClientOptions,
} from "google-auth-library"

type Environment = Record<string, string | undefined>

type GoogleCloudFileClient = {
  createResumableUpload(options: {
    metadata: { contentLength: number; contentType: string }
    preconditionOpts: { ifGenerationMatch: number }
  }): Promise<[string]>
  delete(options: { ignoreNotFound: boolean }): Promise<unknown>
  download(options: {
    decompress: boolean
    validation: "crc32c"
  }): Promise<[Buffer]>
  getMetadata(): Promise<[{ generation?: string | number }, ...unknown[]]>
  save(
    bytes: Buffer,
    options: {
      gzip: boolean
      metadata: { contentType: string }
      preconditionOpts: { ifGenerationMatch: number }
      resumable: boolean
      validation: "crc32c"
    }
  ): Promise<void>
}

type GoogleCloudStorageClient = {
  bucket(name: string): {
    file(
      key: string,
      options?: { generation: string | number }
    ): GoogleCloudFileClient
  }
}

type Dependencies = {
  createExternalAccountClient?: typeof ExternalAccountClient.fromJSON
  createStorageClient?: (options: StorageOptions) => GoogleCloudStorageClient
  getOidcToken?: typeof getVercelOidcToken
  storageClient?: GoogleCloudStorageClient
  fetchImplementation?: typeof fetch
}

type GoogleCloudArtifactConfiguration = {
  bucketName: string
  projectId: string
  workloadIdentity:
    | { kind: "operator-client-required" }
    | {
        audience: string
        kind: "vercel-oidc"
        serviceAccountEmail: string
        vercelAudience: string
      }
}

function requiredEnvironmentValue(
  environment: Environment,
  name: string
): string {
  const value = environment[name]?.trim()
  if (!value) {
    throw new Error(
      `${name} is required for private Google Cloud Artifact storage.`
    )
  }
  return value
}

function requireMatchingEnvironmentValue(
  environment: Environment,
  name: string,
  pattern: RegExp,
  requirement: string
) {
  const value = requiredEnvironmentValue(environment, name)
  if (!pattern.test(value)) {
    throw new Error(`${name} ${requirement}.`)
  }
  return value
}

export function readGoogleCloudArtifactEnvironment(
  environment: Environment = process.env
): GoogleCloudArtifactConfiguration {
  const projectId = requireMatchingEnvironmentValue(
    environment,
    "GCS_PROJECT_ID",
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
    "must be a valid Google Cloud project ID"
  )
  const bucketName = requireMatchingEnvironmentValue(
    environment,
    "GCS_BUCKET_NAME",
    /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/,
    "must be a valid Google Cloud bucket name"
  )

  if (environment.VERCEL !== "1") {
    return {
      bucketName,
      projectId,
      workloadIdentity: { kind: "operator-client-required" },
    }
  }

  const projectNumber = requiredEnvironmentValue(
    environment,
    "GCS_PROJECT_NUMBER"
  )
  if (!/^\d+$/.test(projectNumber)) {
    throw new Error(
      "GCS_PROJECT_NUMBER must contain only digits for private Google Cloud Artifact storage."
    )
  }
  const poolId = requireMatchingEnvironmentValue(
    environment,
    "GCS_WORKLOAD_IDENTITY_POOL_ID",
    /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/,
    "must be a valid workload identity pool ID"
  )
  const providerId = requireMatchingEnvironmentValue(
    environment,
    "GCS_WORKLOAD_IDENTITY_PROVIDER_ID",
    /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/,
    "must be a valid workload identity provider ID"
  )
  const serviceAccountEmail = requireMatchingEnvironmentValue(
    environment,
    "GCS_SERVICE_ACCOUNT_EMAIL",
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/,
    "must be a valid iam.gserviceaccount.com address"
  )

  const providerResource =
    `projects/${projectNumber}/locations/global/` +
    `workloadIdentityPools/${poolId}/providers/${providerId}`
  return {
    bucketName,
    projectId,
    workloadIdentity: {
      audience: `//iam.googleapis.com/${providerResource}`,
      kind: "vercel-oidc",
      serviceAccountEmail,
      vercelAudience: `https://iam.googleapis.com/${providerResource}`,
    },
  }
}

export function googleCloudArtifactObjectKey(customId: string) {
  const digest = createHash("sha256").update(customId, "utf8").digest("hex")
  return `artifacts/${digest}`
}

export function googleCloudPendingUploadObjectKey(customId: string) {
  const digest = createHash("sha256").update(customId, "utf8").digest("hex")
  return `pending-artifact-uploads/${digest}`
}

function isPreconditionFailure(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false
  const code = error.code
  return code === 409 || code === 412 || code === "409" || code === "412"
}

async function downloadExact(file: GoogleCloudFileClient) {
  const [bytes] = await file.download({
    decompress: false,
    validation: "crc32c",
  })
  return Buffer.from(bytes)
}

export function createGoogleCloudArtifactProvider(
  environment: Environment = process.env,
  dependencies: Dependencies = {}
): ArtifactStorageProvider & ArtifactResumableUploadProvider {
  const configuration = readGoogleCloudArtifactEnvironment(environment)
  if (
    configuration.workloadIdentity.kind === "operator-client-required" &&
    !dependencies.storageClient
  ) {
    throw new Error(
      "Non-Vercel Google Cloud Artifact access requires an explicit authenticated storage client."
    )
  }
  let storageClient = dependencies.storageClient

  function getStorageClient() {
    if (storageClient) return storageClient

    const createStorageClient =
      dependencies.createStorageClient ??
      ((options: StorageOptions) => new Storage(options))

    if (configuration.workloadIdentity.kind === "operator-client-required")
      throw new Error("An explicit operator storage client was not retained.")

    const { audience, serviceAccountEmail, vercelAudience } =
      configuration.workloadIdentity
    const getOidcToken = dependencies.getOidcToken ?? getVercelOidcToken
    const externalAccountOptions: IdentityPoolClientOptions = {
      audience,
      service_account_impersonation_url:
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
        `${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: () => getOidcToken({ audience: vercelAudience }),
      },
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      type: "external_account",
    }
    const createExternalAccountClient =
      dependencies.createExternalAccountClient ?? ExternalAccountClient.fromJSON
    const authClient = createExternalAccountClient(externalAccountOptions)
    if (!authClient) {
      throw new Error(
        "Google Cloud Artifact storage could not initialize Vercel workload identity."
      )
    }
    storageClient = createStorageClient({
      authClient,
      projectId: configuration.projectId,
    })
    return storageClient
  }

  function file(key: string, generation?: string | number) {
    return getStorageClient()
      .bucket(configuration.bucketName)
      .file(key, generation === undefined ? undefined : { generation })
  }

  const fetchImplementation = dependencies.fetchImplementation ?? fetch

  async function resumableRequest(
    session: ServerResumableUploadSession,
    init: RequestInit
  ) {
    try {
      return await fetchImplementation(session, {
        ...init,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      throw new ArtifactStorageError(
        "provider-failure",
        "Google Cloud Storage resumable upload request failed.",
        { cause: error }
      )
    }
  }

  function resumableProgress(
    response: Response,
    expectedByteSize: number
  ): ArtifactResumableUploadProgress | null {
    if (response.status === 200 || response.status === 201) {
      return { complete: true, nextOffset: expectedByteSize }
    }
    if (response.status !== 308) return null
    const range = response.headers.get("range")
    if (!range) return { complete: false, nextOffset: 0 }
    const match = /^bytes=0-(\d+)$/.exec(range.trim())
    if (!match) {
      throw new ArtifactStorageError(
        "provider-failure",
        "Google Cloud Storage returned an invalid resumable upload offset."
      )
    }
    const nextOffset = Number(match[1]) + 1
    if (!Number.isSafeInteger(nextOffset) || nextOffset > expectedByteSize) {
      throw new ArtifactStorageError(
        "provider-failure",
        "Google Cloud Storage returned an invalid resumable upload offset."
      )
    }
    return { complete: false, nextOffset }
  }

  function resumableFailure(response: Response) {
    if (
      response.status === 404 ||
      response.status === 410 ||
      response.status === 499
    ) {
      return new ArtifactStorageError(
        "not-found",
        "The Google Cloud Storage resumable upload session is unavailable."
      )
    }
    return new ArtifactStorageError(
      "provider-failure",
      "Google Cloud Storage rejected the resumable upload request."
    )
  }

  async function consumeResumableResponse(response: Response) {
    await response.arrayBuffer().catch(() => undefined)
  }

  async function getResumableStatus(input: {
    expectedByteSize: number
    session: ServerResumableUploadSession
  }) {
    const response = await resumableRequest(input.session, {
      headers: {
        "Content-Length": "0",
        "Content-Range": `bytes */${input.expectedByteSize}`,
      },
      method: "PUT",
    })
    let progress: ArtifactResumableUploadProgress | null
    try {
      progress = resumableProgress(response, input.expectedByteSize)
    } finally {
      await consumeResumableResponse(response)
    }
    if (progress) return progress
    throw resumableFailure(response)
  }

  return {
    identifier: "google-cloud-storage",
    preserveUploadsOnRollback: true,

    async cancelResumable({ session }) {
      const response = await resumableRequest(session, { method: "DELETE" })
      await consumeResumableResponse(response)
      if (
        response.ok ||
        response.status === 404 ||
        response.status === 410 ||
        response.status === 499
      ) {
        return
      }
      throw resumableFailure(response)
    },

    async deleteTemporary({ generation, key }) {
      try {
        await file(key, generation).delete({ ignoreNotFound: true })
      } catch (error) {
        if (isNotFound(error)) return
        throw new ArtifactStorageError(
          "provider-failure",
          "Google Cloud Storage could not delete the temporary upload.",
          { cause: error }
        )
      }
    },

    getResumableStatus,

    async readTemporary({ key }) {
      try {
        const [metadata] = await file(key).getMetadata()
        if (metadata.generation === undefined) {
          throw new ArtifactStorageError(
            "integrity-failure",
            "Temporary upload generation metadata is unavailable."
          )
        }
        const generation = String(metadata.generation)
        return {
          bytes: await downloadExact(file(key, generation)),
          generation,
        }
      } catch (error) {
        if (error instanceof ArtifactStorageError) throw error
        if (isNotFound(error)) {
          throw new ArtifactStorageError(
            "not-found",
            "The temporary upload was not found in Google Cloud Storage.",
            { cause: error }
          )
        }
        throw new ArtifactStorageError(
          "provider-failure",
          "Google Cloud Storage could not read the temporary upload.",
          { cause: error }
        )
      }
    },

    async startResumable({ customId, expectedByteSize, mediaType }) {
      const key = googleCloudPendingUploadObjectKey(customId)
      try {
        const [session] = await file(key).createResumableUpload({
          metadata: {
            contentLength: expectedByteSize,
            contentType: mediaType,
          },
          preconditionOpts: { ifGenerationMatch: 0 },
        })
        if (!session) throw new Error("Resumable session URI was unavailable.")
        return {
          key,
          session: session as ServerResumableUploadSession,
        }
      } catch (error) {
        throw new ArtifactStorageError(
          "provider-failure",
          "Google Cloud Storage could not start the temporary upload.",
          { cause: error }
        )
      }
    },

    async uploadResumableChunk(input) {
      const nextOffset = input.offset + input.bytes.byteLength
      const finalChunk = nextOffset === input.expectedByteSize
      if (
        input.bytes.byteLength === 0 ||
        input.bytes.byteLength > artifactUploadChunkMaxBytes ||
        !Number.isSafeInteger(input.offset) ||
        input.offset < 0 ||
        nextOffset > input.expectedByteSize ||
        (!finalChunk && input.bytes.byteLength % (256 * 1024) !== 0)
      ) {
        throw new ArtifactStorageError(
          "integrity-failure",
          "The temporary upload chunk is invalid."
        )
      }
      let response: Response
      try {
        response = await resumableRequest(input.session, {
          body: Uint8Array.from(input.bytes),
          headers: {
            "Content-Length": String(input.bytes.byteLength),
            "Content-Range":
              `bytes ${input.offset}-${nextOffset - 1}/` +
              input.expectedByteSize,
          },
          method: "PUT",
        })
      } catch (error) {
        try {
          return await getResumableStatus(input)
        } catch {
          throw error
        }
      }
      let progress: ArtifactResumableUploadProgress | null
      try {
        progress = resumableProgress(response, input.expectedByteSize)
      } finally {
        await consumeResumableResponse(response)
      }
      if (progress) return progress
      if (response.status >= 500) return getResumableStatus(input)
      throw resumableFailure(response)
    },

    async delete({ key }) {
      try {
        const [metadata] = await file(key).getMetadata()
        if (metadata.generation === undefined) {
          throw new Error("Stored object generation was unavailable.")
        }
        await file(key, metadata.generation).delete({ ignoreNotFound: true })
      } catch (error) {
        if (isNotFound(error)) return
        throw new ArtifactStorageError(
          "provider-failure",
          "Google Cloud Storage could not delete the retained file.",
          { cause: error }
        )
      }
    },

    async read({ key }) {
      try {
        return await downloadExact(file(key))
      } catch (error) {
        if (isNotFound(error)) {
          throw new ArtifactStorageError(
            "not-found",
            "The retained file was not found in Google Cloud Storage.",
            { cause: error }
          )
        }
        throw new ArtifactStorageError(
          "provider-failure",
          "Google Cloud Storage could not read the retained file.",
          { cause: error }
        )
      }
    },

    async upload({ bytes, customId, mediaType }) {
      const key = googleCloudArtifactObjectKey(customId)
      const target = file(key)
      try {
        await target.save(bytes, {
          gzip: false,
          metadata: { contentType: mediaType },
          preconditionOpts: { ifGenerationMatch: 0 },
          resumable: false,
          validation: "crc32c",
        })
      } catch (error) {
        if (!isPreconditionFailure(error)) {
          throw new ArtifactStorageError(
            "provider-failure",
            "Google Cloud Storage could not store the retained file.",
            { cause: error }
          )
        }
        try {
          const existingBytes = await downloadExact(target)
          if (existingBytes.equals(bytes)) return { key }
        } catch (readError) {
          throw new ArtifactStorageError(
            "provider-failure",
            "Google Cloud Storage could not verify the retained file.",
            { cause: readError }
          )
        }
        throw new ArtifactStorageError(
          "integrity-failure",
          "Google Cloud Storage found different bytes at the retained file key.",
          { cause: error }
        )
      }

      try {
        const storedBytes = await downloadExact(target)
        if (!storedBytes.equals(bytes)) {
          throw new Error("Stored bytes did not match the upload.")
        }
      } catch (error) {
        throw new ArtifactStorageError(
          "integrity-failure",
          "Google Cloud Storage could not verify the retained file.",
          { cause: error }
        )
      }
      return { key }
    },
  }
}

function isNotFound(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false
  return error.code === 404 || error.code === "404"
}
