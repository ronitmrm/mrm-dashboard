import Link from "next/link"
import { notFound } from "next/navigation"

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
  const rows = await repository
    .listDrawingRevisionsForOrganization("MRMPL", { uid })
    .finally(() => repository.close())
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
            Immutable released revisions with approval and ECN provenance.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/commercial/drawing-history">Back to Register</Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{rows[0]!.itemDescription}</CardTitle>
          <CardDescription>{rows.length} controlled revisions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border">
            <Table>
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
                      {row.status} · {row.requirement}
                    </TableCell>
                    <TableCell>{row.effectiveOn || "—"}</TableCell>
                    <TableCell>
                      {row.raisedBy || "—"} / {row.uploadedBy || "—"}
                    </TableCell>
                    <TableCell>
                      {row.approvedBy || "—"}
                      {row.approvedAt
                        ? ` · ${row.approvedAt.toLocaleString()}`
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
                      ) : (
                        "Not Required"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
