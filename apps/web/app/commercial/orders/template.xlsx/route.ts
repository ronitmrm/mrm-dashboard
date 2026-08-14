import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import { buildPoTemplateWorkbook } from "../order-artifacts"

export async function GET() {
  await requireCapability(
    commercialCapabilities.purchaseOrders.read,
    "/commercial/orders"
  )
  return xlsxResponse(buildPoTemplateWorkbook(), "po-line-import-template.xlsx")
}
