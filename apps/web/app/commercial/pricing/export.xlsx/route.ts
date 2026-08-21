import { createCommercialCostingRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildPricingWorkbook,
  pricingWorkbookFilename,
} from "../pricing-workbook"

export async function GET(request: Request) {
  await requireCapability("pricing.pricing.read", "/commercial/pricing")
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await repository
    .listPricingRegisterForExport("MRMPL", { query })
    .finally(() => repository.close())
  return xlsxResponse(buildPricingWorkbook(rows), pricingWorkbookFilename)
}
