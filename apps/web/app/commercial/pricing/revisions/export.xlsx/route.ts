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
    "pricing.quotes.read",
    "/commercial/pricing/revisions"
  )
  const url = new URL(request.url)
  const customer = url.searchParams.get("customer") ?? ""
  const code = url.searchParams.get("code")?.trim().toLowerCase() ?? ""
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const allRows = await repository
    .listPricingRegisterForExport("MRMPL", { revisions: true })
    .finally(() => repository.close())
  const rows = code
    ? allRows.filter(
        (row) =>
          row.customerId === customer &&
          row.customerPartCode?.trim().toLowerCase() === code
      )
    : []
  return xlsxResponse(buildPricingWorkbook(rows), pricingWorkbookFilename)
}
