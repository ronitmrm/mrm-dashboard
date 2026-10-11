import {
  createPrintedDrawingHoldingsRepository,
  createProductPortfolioRepository,
} from "@workspace/db"
import { parseProductionFloorCode } from "@workspace/db/production-floors"

import { DataDownloadButton } from "@/components/data-download-button"
import { DrawingRegister } from "@/components/commercial/drawing-register"
import { MetricSummary, PageHeader } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"

const drawingHistoryPath = "/commercial/drawing-history"

export default async function DrawingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>
}) {
  const session = await requireCapability(
    "pricing.drawing_history.read",
    drawingHistoryPath
  )
  const unit =
    parseProductionFloorCode((await searchParams).unit) ?? "conventional"
  const connectionString = readAuthEnvironment().connectionString
  const repository = createProductPortfolioRepository({ connectionString })
  const holdingsRepository = createPrintedDrawingHoldingsRepository({
    connectionString,
  })
  const [revisions, holdings, grants] = await Promise.all([
    repository
      .listDrawingRevisionsForOrganization("MRMPL")
      .finally(() => repository.close()),
    holdingsRepository
      .listForOrganization("MRMPL", { floor: unit })
      .finally(() => holdingsRepository.close()),
    listGrantedCapabilities(session.user.id, [
      commercialTaskCapabilities.updateDrawingHistory,
    ]),
  ])
  const holdingsByDrawing = new Map(
    holdings.map((holding) => [holding.drawingId, holding])
  )
  const rows = revisions.filter(
    (revision) => revision.current || revision.pendingUpload
  )

  return (
    <div className="grid min-w-0 gap-6">
      <MetricSummary
        scope="Current drawing register · before table filters"
        items={[
          {
            label: "Products",
            value: new Set(rows.map((row) => row.uid)).size,
            tone: "information",
          },
          {
            label: "Current Drawings",
            value: rows.filter((row) => row.current && !row.pendingUpload)
              .length,
            tone: "positive",
          },
          {
            label: "Pending Upload",
            value: rows.filter((row) => row.pendingUpload).length,
            tone: "warning",
          },
        ]}
      />
      <PageHeader
        title="Drawing Register"
        description="Current drawings and legacy records awaiting upload. Select a production unit to record its printed copies and internal storage location."
        actions={
          <DataDownloadButton
            href={`${drawingHistoryPath}/export.xlsx?unit=${unit}`}
          />
        }
      />
      <DrawingRegister
        unit={unit}
        canUpdate={grants.includes(
          commercialTaskCapabilities.updateDrawingHistory
        )}
        rows={rows.map((row) => ({
          drawingId: row.drawingId,
          uid: row.uid,
          itemDescription: row.itemDescription,
          drawingNumber: row.drawingNumber,
          revision: row.revision,
          pendingUpload: row.pendingUpload,
          status: row.status,
          effectiveOn: row.effectiveOn,
          ecnNumber: row.ecnNumber,
          fileName: row.fileName,
          mediaType: row.mediaType,
          holding: holdingsByDrawing.get(row.drawingId) ?? null,
        }))}
      />
    </div>
  )
}
