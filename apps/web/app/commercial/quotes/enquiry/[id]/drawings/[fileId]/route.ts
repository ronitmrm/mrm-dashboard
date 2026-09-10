import { createCommercialCostingRepository } from "@workspace/db"
import { attachmentContentDisposition } from "@/lib/attachment-viewer"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { readUserAttachment } from "@/lib/user-attachment-storage"
import { privateDocumentSecurityHeaders } from "@/lib/security-headers"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await requireCapability(
    "pricing.quotes.read",
    "/commercial/quotes"
  )
  const { id, fileId } = await params
  const query = new URL(request.url).searchParams
  const revision = query.get("revision")
  if (revision !== null && !/^\d+$/.test(revision))
    return new Response("Invalid quote revision.", { status: 400 })
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const drawings = await repository.getQuotationDrawings(
      id,
      session.user.id,
      {
        revision: revision === null ? undefined : Number(revision),
        draft: query.get("draft") === "true",
      }
    )
    const drawing = drawings.find((drawing) => drawing.fileId === fileId)
    if (!drawing) return new Response("Drawing was not found.", { status: 404 })
    const body = await (async () => {
      if (!drawing.publicUrl)
        return (await readUserAttachment(drawing.storageKey)).body
      const response = await fetch(drawing.publicUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      })
      return response.ok ? await response.arrayBuffer() : null
    })()
    if (!body) return new Response("Drawing is unavailable.", { status: 410 })
    return new Response(body, {
      headers: {
        ...privateDocumentSecurityHeaders,
        "Cache-Control": "private, no-store",
        "Content-Type": drawing.mediaType ?? "application/octet-stream",
        "Content-Disposition": attachmentContentDisposition(
          request.url,
          drawing.fileName
        ),
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (
      error instanceof Error &&
      ["Enquiry was not found.", "Quote revision was not found."].includes(
        error.message
      )
    )
      return new Response("Drawing was not found.", { status: 404 })
    throw error
  } finally {
    await repository.close()
  }
}
