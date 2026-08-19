import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { buildStorePurchaseOrderPdf } from "@/lib/store/purchase-order-pdf"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability("store.read", "/store/orders")
  const { id } = await params
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const document = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.getPurchaseOrder({
      organizationId,
      purchaseOrderId: id,
    })
  })().finally(() => repository.close())
  if (!document)
    return new Response("Purchase Order not found.", { status: 404 })
  const bytes = await buildStorePurchaseOrderPdf({
    lines: document.lines,
    orderDate: document.order.orderDate,
    orderNumber: document.order.orderNumber,
    orderType: document.order.orderType,
    remark: document.order.remark,
    supplierAddress: document.order.supplierAddress,
    supplierCode: document.order.supplierCode,
    supplierGstNumber: document.order.supplierGstNumber,
    supplierName: document.order.supplierName,
  })
  const safeName = document.order.orderNumber.replace(/[^a-zA-Z0-9_-]/g, "-")
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Content-Type": "application/pdf",
    },
  })
}
