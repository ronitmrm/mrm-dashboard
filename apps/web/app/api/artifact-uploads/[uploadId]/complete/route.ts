import {
  assertSameOriginMutation,
  authenticatePendingUploadRequest,
  completePendingArtifactUpload,
  pendingUploadErrorResponse,
} from "@/lib/pending-artifact-upload-server"

export const runtime = "nodejs"

type Context = { params: Promise<{ uploadId: string }> }

export async function POST(request: Request, context: Context) {
  try {
    assertSameOriginMutation(request)
    const [{ uploadId }, authorization] = await Promise.all([
      context.params,
      authenticatePendingUploadRequest(request.headers),
    ])
    return Response.json(
      await completePendingArtifactUpload(uploadId, authorization)
    )
  } catch (error) {
    return pendingUploadErrorResponse(error)
  }
}
