import { createCommercialRevisionsRepository } from "@workspace/db"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"
import { writePricingInputWorkbook } from "../input-workbook"

export const maxDuration = 300

export async function GET() {
  await requireCapability("pricing.pricing.read", "/commercial/pricing/update")
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const rows = await repository
    .listPricingInputTemplate("MRMPL")
    .finally(() => repository.close())
  return xlsxResponse(
    writePricingInputWorkbook(rows),
    "mrmpl-pricing-input-update.xlsx"
  )
}
