import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability("store.purchase_register.read", "/store/orders")
  const { id } = await params
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const artifact = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return repository.getPurchaseOrderPdfArtifact({
      organizationId,
      purchaseOrderId: id,
    })
  })().finally(() => repository.close())
  if (!artifact)
    return new Response("Purchase Order not found.", { status: 404 })
  if (!artifact.available) {
    return new Response("Purchase Order PDF is unavailable.", { status: 410 })
  }
  return Response.redirect(artifact.publicUrl, 307)
}
