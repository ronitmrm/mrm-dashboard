import {
  createCommercialOrdersRepository,
  proformaInvoiceXlsxArtifactPurpose,
} from "@workspace/db"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import { buildProformaInvoiceWorkbook } from "../../order-artifacts"

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
      return new Response("Generate PI before exporting PI Excel.", {
        status: 404,
      })
    }
    if (invoice.status !== "Draft") {
      const artifact = await repository.getProformaInvoiceArtifact(
        invoice.id,
        proformaInvoiceXlsxArtifactPurpose
      )
      if (!artifact?.available) {
        return new Response("Sent PI workbook is unavailable.", { status: 410 })
      }
      return await createArtifactDeliveryResponse(request, artifact, {
        download: true,
      })
    }
    return xlsxResponse(
      buildProformaInvoiceWorkbook(order),
      `${invoice.invoiceNumber}-pi.xlsx`
    )
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Sent PI workbook could not be loaded. Please try again.",
      unavailable: "Sent PI workbook is unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await repository.close()
  }
}
