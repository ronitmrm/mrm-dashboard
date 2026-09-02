import { createProductPortfolioRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentResponseHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ revision: string; uid: string }> }
) {
  await requireCapability(
    "pricing.drawing_history.read",
    "/commercial/drawing-history"
  )
  const { revision, uid } = await params
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const file = await repository.getDrawingFileForOrganization(
      "MRMPL",
      uid,
      revision
    )
    if (!file) return new Response("Drawing revision file not found.", { status: 404 })
    if (file.publicUrl) return Response.redirect(file.publicUrl, 307)
    if (!file.storageKey) {
      return new Response("Drawing revision file is unavailable.", { status: 410 })
    }
    const attachment = await readUserAttachment(file.storageKey)
    return new Response(attachment.body, {
      headers: userAttachmentResponseHeaders(
        file.fileName,
        attachment.byteSize,
        file.mediaType,
        new URL(request.url).searchParams.has("preview")
      ),
    })
  } finally {
    await repository.close()
  }
}
