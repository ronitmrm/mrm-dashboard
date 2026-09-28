import { withRejections } from "@/lib/rejections-server"
import { masterCsvResponse } from "@/lib/master-data-csv"
import { qualityRejectionCsvColumns, qualityRejectionCsvRows } from "@/lib/quality-rejection-csv"

export const dynamic = "force-dynamic"

export async function GET() {
  const rows = await withRejections("read", ({ repository, organizationId }) =>
    repository.listEditable(organizationId)
  )
  return masterCsvResponse(
    qualityRejectionCsvRows(rows),
    "quality-control-rejections.csv",
    qualityRejectionCsvColumns
  )
}
