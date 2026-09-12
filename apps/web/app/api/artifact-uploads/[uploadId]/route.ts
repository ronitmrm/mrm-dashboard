import { artifactUploadOffsetHeader } from "@/lib/artifact-upload-contract"
import {
  abandonPendingArtifactUpload,
  appendPendingArtifactUploadChunk,
  assertSameOriginMutation,
  authenticatePendingUploadRequest,
  getPendingArtifactUpload,
  PendingUploadError,
  pendingUploadErrorResponse,
  readBoundedUploadChunk,
} from "@/lib/pending-artifact-upload-server"

export const runtime = "nodejs"

type Context = { params: Promise<{ uploadId: string }> }

export async function GET(request: Request, context: Context) {
  try {
    const [{ uploadId }, authorization] = await Promise.all([
      context.params,
      authenticatePendingUploadRequest(request.headers),
    ])
    return Response.json(
      await getPendingArtifactUpload(uploadId, authorization)
    )
  } catch (error) {
    return pendingUploadErrorResponse(error)
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOriginMutation(request)
    const offsetText = request.headers.get(artifactUploadOffsetHeader)
    if (!offsetText || !/^\d+$/.test(offsetText)) {
      throw new PendingUploadError(
        "invalid_request",
        `${artifactUploadOffsetHeader} header is required.`
      )
    }
    const [{ uploadId }, authorization, bytes] = await Promise.all([
      context.params,
      authenticatePendingUploadRequest(request.headers),
      readBoundedUploadChunk(request),
    ])
    return Response.json(
      await appendPendingArtifactUploadChunk({
        authorization,
        bytes,
        offset: Number(offsetText),
        uploadId,
      })
    )
  } catch (error) {
    return pendingUploadErrorResponse(error)
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOriginMutation(request)
    const [{ uploadId }, authorization] = await Promise.all([
      context.params,
      authenticatePendingUploadRequest(request.headers),
    ])
    return Response.json(
      await abandonPendingArtifactUpload(uploadId, authorization)
    )
  } catch (error) {
    return pendingUploadErrorResponse(error)
  }
}
