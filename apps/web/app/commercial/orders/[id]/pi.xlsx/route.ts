import { createCommercialOrdersRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import { buildProformaInvoiceWorkbook } from "../../order-artifacts"

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
      return new Response("Generate PI before exporting PI Excel.", {
        status: 404,
      })
    }
    return xlsxResponse(
      buildProformaInvoiceWorkbook(order),
      `${invoice.invoiceNumber}-pi.xlsx`
    )
  } finally {
    await repository.close()
  }
}
