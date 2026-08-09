import { createCommercialWorkflowRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import { buildFollowupHistoryWorkbook } from "../../../sales-history-workbook"

export async function GET() {
  await requireCapability("pricing.sales.read", "/commercial/sales")
  const repository = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return xlsxResponse(
      buildFollowupHistoryWorkbook(
        await repository.listFollowupsForExport("MRMPL")
      ),
      "followup-history.xlsx"
    )
  } finally {
    await repository.close()
  }
}
