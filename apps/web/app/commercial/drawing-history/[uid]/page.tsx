import { formatIstDateTime } from "@/lib/date-time"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  createPrintedDrawingHoldingsRepository,
  createProductPortfolioRepository,
} from "@workspace/db"
import { productionFloors } from "@workspace/db/production-floors"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  SectionCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function DrawingRevisionHistoryPage({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const { uid } = await params
  const path = `/commercial/drawing-history/${encodeURIComponent(uid)}`
  await requireCapability("pricing.drawing_history.read", path)
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const holdingsRepository = createPrintedDrawingHoldingsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const [rows, holdings] = await Promise.all([
    repository
      .listDrawingRevisionsForOrganization("MRMPL", { uid })
      .finally(() => repository.close()),
    holdingsRepository
      .listForOrganization("MRMPL", { uid })
      .finally(() => holdingsRepository.close()),
  ])
  const revisionsById = new Map(rows.map((row) => [row.drawingId, row]))
  if (!rows.length) notFound()

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{uid}</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Drawing Revision History
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable released revisions plus provisional legacy metadata
            awaiting files.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/drawing-history">Back to Register</Link>
        </Button>
      </section>

      <SectionCard>
        <CardHeader>
          <CardTitle>{rows[0]!.itemDescription}</CardTitle>
          <CardDescription>{rows.length} drawing records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="min-w-0 rounded-2xl border">
            <OperationalTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Revision</TableHead>
                  <TableHead>Drawing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Raised / Uploaded</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead>Change Reason / ECN</TableHead>
                  <TableHead>File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.drawingId}>
                    <TableCell>
                      <Badge variant={row.current ? "default" : "secondary"}>
                        {row.revision}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {row.drawingNumber}
                    </TableCell>
                    <TableCell>
                      {row.pendingUpload
                        ? "Pending Drawing Upload"
                        : row.status}
                      {` · ${row.requirement}`}
                    </TableCell>
                    <TableCell>{formatCalendarDate(row.effectiveOn || "—")}</TableCell>
                    <TableCell>
                      {row.raisedBy || "—"} / {row.uploadedBy || "—"}
                    </TableCell>
                    <TableCell>
                      {row.approvedBy || "—"}
                      {row.approvedAt
                        ? ` · ${formatIstDateTime(row.approvedAt)}`
                        : ""}
                    </TableCell>
                    <TableCell>
                      {row.changeReason} · {row.ecnNumber || "Initial Design"}
                    </TableCell>
                    <TableCell>
                      {row.fileName ? (
                        <AttachmentViewerLink
                          className="font-medium underline underline-offset-4"
                          fileName={row.fileName}
                          href={`${path}/file/${row.revision}`}
                          mediaType={row.mediaType}
                        >
                          View
                        </AttachmentViewerLink>
                      ) : row.pendingUpload ? (
                        "Pending upload"
                      ) : (
                        "Not Required"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </div>
        </CardContent>
      </SectionCard>
      {holdings.length ? (
        <SectionCard>
          <CardHeader>
            <CardTitle>Printed Drawing Locations</CardTitle>
            <CardDescription>
              Last recorded holdings for each drawing revision and production
              unit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OperationalTable
              containerClassName="rounded-xl border"
              excelFilters
              filterStorageKey="drawing-revision-printed-holdings"
            >
              <TableHeader>
                <TableRow>
                  <TableHead data-filterable="true">Revision</TableHead>
                  <TableHead data-filterable="true">Production Unit</TableHead>
                  <TableHead data-filterable="true">Printed Copies</TableHead>
                  <TableHead data-filterable="true">
                    Internal Location
                  </TableHead>
                  <TableHead>Updated By</TableHead>
                  <TableHead>Updated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => (
                  <TableRow
                    key={`${holding.drawingId}-${holding.productionFloorCode}`}
                  >
                    <TableCell>
                      {revisionsById.get(holding.drawingId)?.revision ?? "—"}
                    </TableCell>
                    <TableCell>
                      {
                        productionFloors.find(
                          (floor) => floor.code === holding.productionFloorCode
                        )?.shortLabel
                      }
                    </TableCell>
                    <TableCell>{holding.quantity}</TableCell>
                    <TableCell>{holding.location || "—"}</TableCell>
                    <TableCell>{holding.updatedBy || "—"}</TableCell>
                    <TableCell>
                      {formatIstDateTime(holding.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </OperationalTable>
          </CardContent>
        </SectionCard>
      ) : null}
    </div>
  )
}
