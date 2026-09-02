import Link from "next/link"

import { createProductPortfolioRepository } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { DataDownloadButton } from "@/components/data-download-button"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const drawingHistoryPath = "/commercial/drawing-history"

export default async function DrawingHistoryPage() {
  await requireCapability("pricing.drawing_history.read", drawingHistoryPath)
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const revisions = await repository
    .listDrawingRevisionsForOrganization("MRMPL")
    .finally(() => repository.close())
  const rows = revisions.filter((revision) => revision.current)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Drawing Register</CardTitle>
              <CardDescription>
                Current released drawing per Product. Revision evidence is
                immutable and originates in Initial Design or an approved ECN.
              </CardDescription>
            </div>
            <DataDownloadButton href={`${drawingHistoryPath}/export.xlsx`} />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Controlled Drawings</CardTitle>
          <CardDescription>{rows.length} Products.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border">
            <Table excelFilters>
              <TableHeader>
                <TableRow>
                  <TableHead data-filterable="true">Product UID</TableHead>
                  <TableHead data-filterable="true">Part</TableHead>
                  <TableHead data-filterable="true">Drawing No.</TableHead>
                  <TableHead data-filterable="true">Revision</TableHead>
                  <TableHead data-filterable="true">Status</TableHead>
                  <TableHead data-filterable="true">Effective</TableHead>
                  <TableHead data-filterable="true">ECN</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => {
                    const fileHref = `${drawingHistoryPath}/${encodeURIComponent(row.uid)}/file/${row.revision}`
                    return (
                      <TableRow key={row.drawingId}>
                        <TableCell className="font-mono">{row.uid}</TableCell>
                        <TableCell>{row.itemDescription}</TableCell>
                        <TableCell className="font-mono">
                          {row.drawingNumber}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.revision}</Badge>
                        </TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.effectiveOn || "—"}</TableCell>
                        <TableCell>{row.ecnNumber || "Initial Design"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {row.fileName ? (
                              <Button asChild size="sm" variant="outline">
                                <AttachmentViewerLink
                                  fileName={row.fileName}
                                  href={fileHref}
                                  mediaType={row.mediaType}
                                >
                                  View
                                </AttachmentViewerLink>
                              </Button>
                            ) : null}
                            <Button asChild size="sm" variant="ghost">
                              <Link
                                href={`${drawingHistoryPath}/${encodeURIComponent(row.uid)}`}
                              >
                                History
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={8}
                    >
                      No released controlled drawings.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
