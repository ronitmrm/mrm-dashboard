import { createCommercialCostingRepository } from "@workspace/db"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { privateDocumentSecurityHeaders } from "@/lib/security-headers"
import { buildQuoteDrawingsZip } from "@/lib/pricing/quote-drawing-download"
import { readQuoteDrawing } from "@/lib/pricing/read-quote-drawing"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireCapability(
    "pricing.quotes.read",
    "/commercial/quotes"
  )
  const { id } = await params
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
    const files = []
    // Read sequentially so a large quote does not exhaust storage connections.
    for (const drawing of drawings) {
      const body = await readQuoteDrawing(drawing)
      if (body)
        files.push({
          lineNumber: drawing.lineNumber,
          fileName: drawing.fileName,
          bytes: new Uint8Array(body),
        })
    }
    if (!files.length)
      return new Response("No drawings attached.", { status: 404 })
    const archive = buildQuoteDrawingsZip(files)
    const name = `quotation-drawings-${revision === null ? "current" : `revision-${revision}`}.zip`
    return new Response(new Uint8Array(archive), {
      headers: {
        ...privateDocumentSecurityHeaders,
        "Cache-Control": "private, no-store",
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(archive.byteLength),
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
      return new Response("Quote was not found.", { status: 404 })
    throw error
  } finally {
    await repository.close()
  }
}
