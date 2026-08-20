import {
  createCommercialReportingRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildDrawingHistoryWorkbook,
  drawingHistoryFilename,
} from "../../catalog-workbooks"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireCapability(
    "pricing.drawing_history.read",
    "/commercial/drawing-history"
  )
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  try {
    const rows = await repository.listDrawingHistoryForExport({
      organizationId: await customers.organizationIdForCode("MRMPL"),
    })
    return xlsxResponse(
      buildDrawingHistoryWorkbook(rows),
      drawingHistoryFilename
    )
  } finally {
    await repository.close()
    await customers.close()
  }
}
