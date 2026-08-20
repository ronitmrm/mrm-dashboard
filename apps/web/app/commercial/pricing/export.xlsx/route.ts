import { createCommercialCostingRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildPricingWorkbook,
  pricingWorkbookFilename,
} from "../pricing-workbook"

export async function GET() {
  await requireCapability("pricing.pricing.read", "/commercial/pricing")
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await repository
    .listPricingRegisterForExport("MRMPL")
    .finally(() => repository.close())
  return xlsxResponse(buildPricingWorkbook(rows), pricingWorkbookFilename)
}
