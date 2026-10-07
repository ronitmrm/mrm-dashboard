import {
  authorizeStorePurchaseOrderArtifactTarget,
  createArtifactService,
  createStoreRepository,
  storePurchaseOrderPdfArtifactPurpose,
} from "@workspace/db"

import { buildStorePurchaseOrderPdf } from "./purchase-order-pdf"

export function storeIssuedPurchaseOrderPdf(
  artifacts: ReturnType<typeof createArtifactService>,
  actorUserId: string
) {
  return async (input: {
    document: NonNullable<
      Awaited<ReturnType<ReturnType<typeof createStoreRepository>["getPurchaseOrder"]>>
    >
    organizationId: string
    purchaseOrderId: string
  }) => {
    const bytes = Buffer.from(await buildStorePurchaseOrderPdf({
      lines: input.document.lines,
      orderDate: input.document.order.orderDate,
      orderNumber: input.document.order.orderNumber,
      orderType: input.document.order.orderType,
      remark: input.document.order.remark,
      supplierAddress: input.document.order.supplierAddress,
      supplierCode: input.document.order.supplierCode,
      supplierGstNumber: input.document.order.supplierGstNumber,
      supplierName: input.document.order.supplierName,
    }))
    const safeNumber = input.document.order.orderNumber
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
    await artifacts.store({
      actorUserId,
      authorizeTarget: (client, { isRetry }) =>
        authorizeStorePurchaseOrderArtifactTarget(
          client,
          { organizationId: input.organizationId, purchaseOrderId: input.purchaseOrderId },
          { requirePendingState: !isRetry }
        ),
      bytes,
      fileName: `${safeNumber || "store-po"}.pdf`,
      idempotencyKey: `issued-store-po-pdf:${input.purchaseOrderId}`,
      mediaType: "application/pdf",
      organizationId: input.organizationId,
      origin: "generated",
      purpose: storePurchaseOrderPdfArtifactPurpose,
      target: { id: input.purchaseOrderId, schema: "store", table: "purchase_orders" },
    })
  }
}
