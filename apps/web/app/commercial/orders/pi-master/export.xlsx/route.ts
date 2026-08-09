import { createCommercialOrdersRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import { buildOrderMasterWorkbook } from "../../order-artifacts"

export async function GET() {
  await requireCapability(
    commercialCapabilities.purchaseOrders.read,
    "/commercial/orders"
  )
  const repository = createCommercialOrdersRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const rows = await repository.listPurchaseOrderReportRowsForExport(
      "MRMPL",
      { approvedOnly: true }
    )
    return xlsxResponse(
      buildOrderMasterWorkbook(rows, true),
      "approved-pi-master.xlsx"
    )
  } finally {
    await repository.close()
  }
}
