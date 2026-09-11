import "server-only"

import { createHash } from "node:crypto"

import { Storage, type StorageOptions } from "@google-cloud/storage"
import { getVercelOidcToken } from "@vercel/oidc"
import {
  ArtifactStorageError,
  type ArtifactStorageProvider,
} from "@workspace/db"
import {
  ExternalAccountClient,
  type IdentityPoolClientOptions,
} from "google-auth-library"

type Environment = Record<string, string | undefined>

type GoogleCloudFileClient = {
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
}

type GoogleCloudArtifactConfiguration = {
  bucketName: string
  projectId: string
  workloadIdentity:
    | { kind: "application-default-credentials" }
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
      workloadIdentity: { kind: "application-default-credentials" },
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
): ArtifactStorageProvider {
  const configuration = readGoogleCloudArtifactEnvironment(environment)
  let storageClient = dependencies.storageClient

  function getStorageClient() {
    if (storageClient) return storageClient

    const createStorageClient =
      dependencies.createStorageClient ??
      ((options: StorageOptions) => new Storage(options))

    if (
      configuration.workloadIdentity.kind === "application-default-credentials"
    ) {
      storageClient = createStorageClient({
        projectId: configuration.projectId,
      })
      return storageClient
    }

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

  return {
    identifier: "google-cloud-storage",
    preserveUploadsOnRollback: true,

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
