import { createCommercialCostingRepository } from "@workspace/db"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
  streamedPrivateFileResponse,
} from "@/lib/artifact-delivery"
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
  request: Request,
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
    const query = new URL(request.url).searchParams
    const requestedRevision = query.get("revision")
    if (requestedRevision !== null && !/^\d+$/.test(requestedRevision))
      return new Response("Invalid quote revision.", { status: 400 })
    const versions = await repository.listQuotationVersions(id, session.user.id)
    const version =
      requestedRevision === null
        ? versions.at(-1)
        : versions.find((row) => row.revision === Number(requestedRevision))
    if (requestedRevision !== null && !version)
      return new Response("Quote revision was not found.", { status: 404 })
    const preview =
      version?.status === "Draft" ||
      (requestedRevision === null && query.get("draft") === "true")
    const artifact = preview
      ? null
      : await repository.getQuotePdfArtifact(id, scope, version?.revision)
    if (artifact) {
      if (!artifact.available) {
        return new Response("Quote PDF is unavailable.", { status: 410 })
      }
      return await createArtifactDeliveryResponse(request, artifact, {
        download: query.has("download"),
      })
    }
    if (!preview && version)
      return new Response("Historical quote PDF is unavailable.", {
        status: 410,
      })
    if (!preview && !(await repository.hasHistoricalQuote(id, scope))) {
      return new Response("Sent Quote PDF was not found.", { status: 404 })
    }
    const document = (await repository.getQuoteDocument(id, scope, {
      preview,
    })) as QuoteDocument
    const market = await loadQuoteMarketContext({
      currency: document.currency,
      conversionRate: document.conversionRate,
    })
    const bytes = await buildQuotePdf(document, market)
    const safeName = document.enquiryNumber.replace(/[\r\n"]/g, "_")
    const fileName = `${safeName}-Rev-${document.revision}-quote.pdf`
    return streamedPrivateFileResponse(bytes, {
      download: query.has("download"),
      fileName,
      mediaType: "application/pdf",
      requestUrl: request.url,
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Quote PDF could not be loaded. Please try again.",
      unavailable: "Quote PDF is unavailable.",
    })
    if (delivery) return delivery
    if (error instanceof Error && error.message === "Enquiry was not found.") {
      return new Response(error.message, { status: 404 })
    }
    throw error
  } finally {
    await repository.close()
  }
}
