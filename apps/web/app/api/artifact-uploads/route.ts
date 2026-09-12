import {
  assertSameOriginMutation,
  authenticatePendingUploadRequest,
  PendingUploadError,
  pendingUploadErrorResponse,
  startPendingArtifactUpload,
} from "@/lib/pending-artifact-upload-server"

export const runtime = "nodejs"

async function requestJson(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024) {
    throw new PendingUploadError(
      "invalid_request",
      "Upload request is too large."
    )
  }
  const text = await request.text()
  if (Buffer.byteLength(text) > 32 * 1024) {
    throw new PendingUploadError(
      "invalid_request",
      "Upload request is too large."
    )
  }
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Upload JSON must be an object.")
    }
    return value as Record<string, unknown>
  } catch {
    throw new PendingUploadError("invalid_request", "Upload JSON is invalid.")
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request)
    const authorization = await authenticatePendingUploadRequest(
      request.headers
    )
    const body = await requestJson(request)
    return Response.json(
      await startPendingArtifactUpload({
        authorization,
        byteSize: body.byteSize,
        fileName: body.fileName,
        intent: body.intent,
        mediaType: body.mediaType,
      }),
      { status: 201 }
    )
  } catch (error) {
    return pendingUploadErrorResponse(error)
  }
}
