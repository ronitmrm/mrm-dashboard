import "server-only"

import { createHash } from "node:crypto"
import path from "node:path"

import {
  ArtifactStorageError,
  type ArtifactByteLocator,
  type ArtifactStorageProvider,
  type ArtifactStorageProviderIdentifier,
} from "@workspace/db"

import { attachmentContentDisposition } from "./attachment-viewer"
import { privateDocumentSecurityHeaders } from "./security-headers"
import { createStoredArtifactProvider } from "./artifact-storage-providers"
import { userAttachmentResponseHeaders } from "./user-attachment-security"
import { readUserAttachment } from "./user-attachment-storage"

type ArtifactReaderDependencies = {
  providerFor?: (
    identifier: ArtifactStorageProviderIdentifier
  ) => Pick<ArtifactStorageProvider, "read">
  readLegacy?: typeof readUserAttachment
}

function deliveryFailure(
  code: "integrity-failure" | "not-found",
  message: string,
  cause?: unknown
) {
  return new ArtifactStorageError(
    code,
    message,
    cause === undefined ? undefined : { cause }
  )
}

function verifyRetainedBytes(bytes: Buffer, locator: ArtifactByteLocator) {
  if (locator.byteSize === null || locator.sha256 === null) {
    throw deliveryFailure(
      "integrity-failure",
      "Retained file integrity metadata is unavailable."
    )
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (bytes.byteLength !== locator.byteSize || sha256 !== locator.sha256) {
    throw deliveryFailure(
      "integrity-failure",
      "Retained file integrity verification failed."
    )
  }
}

export async function readVerifiedArtifactBytes(
  locator: ArtifactByteLocator,
  dependencies: ArtifactReaderDependencies = {}
) {
  if (locator.physicalObjectId === null) {
    if (!locator.storageKey) {
      throw deliveryFailure(
        "not-found",
        "Historical file bytes are unavailable."
      )
    }
    try {
      const stored = await (dependencies.readLegacy ?? readUserAttachment)(
        locator.storageKey
      )
      const bytes = Buffer.from(stored.body)
      if (locator.byteSize !== null && locator.sha256 !== null) {
        verifyRetainedBytes(bytes, locator)
      }
      return bytes
    } catch (error) {
      if (error instanceof ArtifactStorageError) throw error
      if (
        error instanceof Error &&
        error.message === "Attachment file was not found."
      ) {
        throw deliveryFailure(
          "not-found",
          "Historical file bytes are unavailable.",
          error
        )
      }
      throw error
    }
  }

  if (!locator.provider || !locator.providerKey) {
    throw deliveryFailure(
      "integrity-failure",
      "Retained file provider metadata is unavailable."
    )
  }
  const provider = (dependencies.providerFor ?? createStoredArtifactProvider)(
    locator.provider
  )
  let bytes: Buffer
  try {
    bytes = await provider.read({ key: locator.providerKey })
  } catch (error) {
    if (error instanceof ArtifactStorageError) throw error
    throw new ArtifactStorageError(
      "provider-failure",
      "The retained file provider could not be read.",
      { cause: error }
    )
  }
  verifyRetainedBytes(bytes, locator)
  return bytes
}

function streamedBody(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

const safeArtifactMediaTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "image/jpeg",
  "image/png",
])

function safeArtifactMediaType(fileName: string, declared: string | null) {
  const normalized = declared?.trim().toLowerCase()
  if (normalized && safeArtifactMediaTypes.has(normalized)) return normalized
  switch (path.extname(fileName).toLowerCase()) {
    case ".pdf":
      return "application/pdf"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case ".zip":
      return "application/zip"
    default:
      return "application/octet-stream"
  }
}

export function streamedPrivateFileResponse(
  bytes: Uint8Array,
  input: {
    download: boolean
    fileName: string
    mediaType: string | null
    requestUrl: string
  }
) {
  const safeHeaders = userAttachmentResponseHeaders(
    input.fileName,
    bytes.byteLength,
    input.mediaType,
    !input.download
  )
  const previewable = safeHeaders["Content-Disposition"].startsWith("inline")
  const dispositionUrl = new URL(input.requestUrl)
  if (input.download || !previewable) {
    dispositionUrl.searchParams.set("download", "")
  } else {
    dispositionUrl.searchParams.delete("download")
  }

  return new Response(streamedBody(bytes), {
    headers: {
      ...privateDocumentSecurityHeaders,
      ...safeHeaders,
      "Cache-Control": "private, no-store",
      "Content-Disposition": attachmentContentDisposition(
        dispositionUrl.toString(),
        input.fileName
      ),
      "Content-Type": safeArtifactMediaType(input.fileName, input.mediaType),
    },
  })
}

export async function createArtifactDeliveryResponse(
  request: Request,
  locator: ArtifactByteLocator,
  input: { download: boolean },
  dependencies: ArtifactReaderDependencies = {}
) {
  const bytes = await readVerifiedArtifactBytes(locator, dependencies)
  return streamedPrivateFileResponse(bytes, {
    download: input.download,
    fileName: locator.fileName,
    mediaType: locator.mediaType,
    requestUrl: request.url,
  })
}

export function artifactDeliveryErrorResponse(
  error: unknown,
  messages: { failed: string; unavailable: string }
) {
  if (!(error instanceof ArtifactStorageError)) return null
  return error.code === "not-found"
    ? new Response(messages.unavailable, { status: 410 })
    : new Response(messages.failed, { status: 502 })
}
