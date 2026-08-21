import { createCommercialCostingRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildPricingWorkbook,
  pricingWorkbookFilename,
} from "../../pricing-workbook"

export async function GET(request: Request) {
  await requireCapability(
    "pricing.pricing.read",
    "/commercial/pricing/revisions"
  )
  const url = new URL(request.url)
  const customer = url.searchParams.get("customer") ?? ""
  const code = url.searchParams.get("code")?.trim() ?? ""
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await (async () => {
    try {
      return code
        ? await repository.listPricingRegisterForExport("MRMPL", {
            customerId: customer,
            customerPartCode: code,
            revisions: true,
          })
        : []
    } finally {
      await repository.close()
    }
  })()
  return xlsxResponse(buildPricingWorkbook(rows), pricingWorkbookFilename)
}
