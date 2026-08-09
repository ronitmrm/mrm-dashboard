import { createCommercialOrdersRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import { buildPurchaseOrderWorkbook } from "../../order-artifacts"

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
    return xlsxResponse(
      buildPurchaseOrderWorkbook(order),
      `${order.poNumber}-po.xlsx`
    )
  } finally {
    await repository.close()
  }
}
