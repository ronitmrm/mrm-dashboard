import { xlsxResponse } from "@/lib/xlsx-response"
import { withDocumentControl } from "@/lib/iso-document/server"
import { buildMasterDocumentWorkbook } from "../master-document-workbook"

export async function GET() {
  const rows = await withDocumentControl(
    "read",
    ({ repository, organizationId }) =>
      repository.listMasterDocuments(organizationId).then(({ all }) => all)
  )
  return xlsxResponse(
    buildMasterDocumentWorkbook(rows),
    "master-document-list.xlsx"
  )
}
