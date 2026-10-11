import {
  createCommercialReportingRepository,
  createCustomerRepository,
  createPrintedDrawingHoldingsRepository,
  createProductPortfolioRepository,
} from "@workspace/db"
import {
  parseProductionFloorCode,
  productionFloors,
} from "@workspace/db/production-floors"
import * as XLSX from "xlsx"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { xlsxResponse } from "@/lib/xlsx-response"

import {
  buildDrawingHistoryWorkbook,
  drawingHistoryFilename,
} from "../../catalog-workbooks"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  await requireCapability(
    "pricing.drawing_history.read",
    "/commercial/drawing-history"
  )
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  const drawings = createProductPortfolioRepository({ connectionString })
  const holdingsRepository = createPrintedDrawingHoldingsRepository({
    connectionString,
  })
  const unit =
    parseProductionFloorCode(new URL(request.url).searchParams.get("unit")) ??
    "conventional"
  try {
    const [rows, revisions, holdings] = await Promise.all([
      customers
        .organizationIdForCode("MRMPL")
        .then((organizationId) =>
          repository.listDrawingHistoryForExport({ organizationId })
        ),
      drawings.listDrawingRevisionsForOrganization("MRMPL"),
      holdingsRepository.listForOrganization("MRMPL", { floor: unit }),
    ])
    const workbook = buildDrawingHistoryWorkbook(rows)
    const holdingsByDrawing = new Map(
      holdings.map((holding) => [holding.drawingId, holding])
    )
    const unitLabel =
      productionFloors.find((floor) => floor.code === unit)?.shortLabel ?? unit
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        revisions
          .filter((row) => row.current || row.pendingUpload)
          .map((row) => {
            const holding = holdingsByDrawing.get(row.drawingId)
            return {
              "Production Unit": unitLabel,
              "Product UID": row.uid,
              Part: row.itemDescription,
              "Drawing No.": row.drawingNumber,
              Revision: row.revision,
              "Printed Copies": holding?.quantity ?? "Not recorded",
              "Internal Location": holding?.location ?? "",
              "Updated By": holding?.updatedBy ?? "",
              "Updated At": holding?.updatedAt.toISOString() ?? "",
            }
          })
      ),
      "Printed Copies"
    )
    return xlsxResponse(workbook, drawingHistoryFilename)
  } finally {
    await repository.close()
    await customers.close()
    await drawings.close()
    await holdingsRepository.close()
  }
}
