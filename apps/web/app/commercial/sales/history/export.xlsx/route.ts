import { createCommercialWorkflowRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import { buildSalesHistoryWorkbook } from "../../sales-history-workbook"

export async function GET() {
  await requireCapability("pricing.sales.read", "/commercial/sales")
  const repository = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const { followups, sentQuotes } =
      await repository.getSalesHistoryForExport("MRMPL")
    return xlsxResponse(
      buildSalesHistoryWorkbook(followups, sentQuotes),
      "sales-history.xlsx"
    )
  } finally {
    await repository.close()
  }
}
