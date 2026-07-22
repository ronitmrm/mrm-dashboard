import { createCommercialOrdersRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

import { buildProformaInvoicePdf } from "../../order-artifacts"

export async function GET(
  _request: Request,
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
    const bytes = await buildProformaInvoicePdf(order)
    const safeName = invoice.invoiceNumber.replace(/[\r\n"]/g, "_")
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Disposition": `inline; filename="${safeName}.pdf"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } finally {
    await repository.close()
  }
}
