import { createCommercialCostingRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import {
  buildQuotePdf,
  loadQuoteMarketContext,
  type QuoteDocument,
} from "@/lib/pricing/quote-pdf"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireCapability(
    commercialCapabilities.quotes.read,
    "/commercial/quotes"
  )
  const { id } = await params
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const scope = { originatingSalespersonUserId: session.user.id }
    const artifact = await repository.getQuotePdfArtifact(id, scope)
    if (artifact) {
      if (!artifact.available) {
        return new Response("Quote PDF is unavailable.", { status: 410 })
      }
      return Response.redirect(artifact.publicUrl, 307)
    }
    if (!(await repository.hasHistoricalQuote(id, scope))) {
      return new Response("Sent Quote PDF was not found.", { status: 404 })
    }
    const document = (await repository.getQuoteDocument(
      id,
      scope
    )) as QuoteDocument
    const market = await loadQuoteMarketContext({
      currency: document.currency,
      fallbackRate: document.conversionRate,
    })
    const bytes = await buildQuotePdf(document, market)
    const safeName = document.enquiryNumber.replace(/[\r\n"]/g, "_")
    return new Response(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      {
        headers: {
          "Content-Disposition":
            'inline; filename="' +
            safeName +
            "-Rev-" +
            String(document.revision) +
            '-quote.pdf"',
          "Content-Length": String(bytes.byteLength),
          "Content-Type": "application/pdf",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } catch (error) {
    if (error instanceof Error && error.message === "Enquiry was not found.") {
      return new Response(error.message, { status: 404 })
    }
    throw error
  } finally {
    await repository.close()
  }
}
