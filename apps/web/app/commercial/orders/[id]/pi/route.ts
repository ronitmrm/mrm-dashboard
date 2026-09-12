import {
  createCommercialOrdersRepository,
  proformaInvoicePdfArtifactPurpose,
} from "@workspace/db"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
  streamedPrivateFileResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import { buildProformaInvoicePdf } from "../../order-artifacts"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability(
    commercialCapabilities.purchaseOrders.read,
    "/commercial/orders"
  )
  const { id } = await params
  const repository = createCommercialOrdersRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const order = await repository.getPurchaseOrder(id)
    const invoice = order.invoices[0]
    if (!invoice) {
      return new Response("Generate PI before opening the PI PDF.", {
        status: 404,
      })
    }
    if (invoice.status !== "Draft") {
      const artifact = await repository.getProformaInvoiceArtifact(
        invoice.id,
        proformaInvoicePdfArtifactPurpose
      )
      if (!artifact?.available) {
        return new Response("Sent PI PDF is unavailable.", { status: 410 })
      }
      return await createArtifactDeliveryResponse(request, artifact, {
        download: new URL(request.url).searchParams.has("download"),
      })
    }
    const bytes = await buildProformaInvoicePdf(order)
    const safeName = invoice.invoiceNumber.replace(/[\r\n"]/g, "_")
    return streamedPrivateFileResponse(bytes, {
      download: new URL(request.url).searchParams.has("download"),
      fileName: `${safeName}.pdf`,
      mediaType: "application/pdf",
      requestUrl: request.url,
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Sent PI PDF could not be loaded. Please try again.",
      unavailable: "Sent PI PDF is unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await repository.close()
  }
}
