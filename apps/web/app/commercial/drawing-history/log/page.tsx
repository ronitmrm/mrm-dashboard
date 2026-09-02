import {
  createCommercialReportingRepository,
  createCustomerRepository,
  type DrawingChangeValues,
} from "@workspace/db"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
 SectionCard,
  CardContent,
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

import { readAuthEnvironment } from "@/lib/auth/auth"
import { MetricSummary } from "@/components/ui/golden-patterns"
import { requireCapability } from "@/lib/auth/require-capability"

const drawingHistoryPath = "/commercial/drawing-history"

function transition(previous: unknown, current: unknown) {
  const before =
    previous === null || previous === undefined ? "" : String(previous)
  const after = current === null || current === undefined ? "" : String(current)
  if (!before || before === after) return after || "—"
  return `${before} → ${after || "—"}`
}

function quantities(values: DrawingChangeValues | null) {
  if (!values) return null
  return [
    values.buffoliLaminatedQuantity,
    values.conventionalLaminatedQuantity,
    values.cncLaminatedQuantity,
  ].join(" / ")
}

export default async function DrawingChangeLogPage() {
  await requireCapability(
    "pricing.drawing_history.read",
    `${drawingHistoryPath}/log`
  )
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  let rows
  try {
    rows = await repository.listDrawingChangeLog({
      organizationId: await customers.organizationIdForCode("MRMPL"),
    })
  } finally {
    await repository.close()
    await customers.close()
  }

  return (
 <SectionCard>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Drawing Change Log</CardTitle>
          </div>
          <Button asChild variant="outline">
            <Link href={drawingHistoryPath}>
              <ArrowLeft /> Drawing Register
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <MetricSummary
          className="mb-4"
          scope="Loaded drawing change history · before table filters"
          items={[
            { label: "Changes", value: rows.length, tone: "information" },
            {
              label: "Products",
              value: new Set(rows.map((row) => row.uid)).size,
              tone: "brand"
            }
          ]}
        />
        <div className="max-h-[75vh] overflow-auto rounded-2xl border">
 <OperationalTable excelFilters>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead data-filterable="true">Changed At</TableHead>
                <TableHead data-filterable="true">Change</TableHead>
                <TableHead data-filterable="true">Part Name</TableHead>
                <TableHead data-filterable="true">Uid</TableHead>
                <TableHead data-filterable="true">Drawing No.</TableHead>
                <TableHead data-filterable="true">Revision</TableHead>
                <TableHead data-filterable="true">Rev Date</TableHead>
                <TableHead data-filterable="true">
                  Laminated B / C / Cnc
                </TableHead>
                <TableHead data-filterable="true">Remarks</TableHead>
                <TableHead data-filterable="true">Changed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.changeId}>
                  <TableCell>{row.changedAt}</TableCell>
                  <TableCell data-filter-value={row.changeType}>
                    <Badge variant="outline">{row.changeType}</Badge>
                  </TableCell>
                  <TableCell>{row.itemDescription}</TableCell>
                  <TableCell className="font-mono">{row.uid}</TableCell>
                  <TableCell className="font-mono">
                    {transition(
                      row.before?.drawingNumber,
                      row.after.drawingNumber
                    )}
                  </TableCell>
                  <TableCell>
                    {transition(row.before?.revision, row.after.revision)}
                  </TableCell>
                  <TableCell>
                    {transition(
                      row.before?.revisionDate,
                      row.after.revisionDate
                    )}
                  </TableCell>
                  <TableCell>
                    {transition(quantities(row.before), quantities(row.after))}
                  </TableCell>
                  <TableCell className="max-w-96 whitespace-normal">
                    {transition(row.before?.remarks, row.after.remarks)}
                  </TableCell>
                  <TableCell>{row.changedBy}</TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-muted-foreground"
                    colSpan={10}
                  >
                    No Drawing Changes Have Been Recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
 </OperationalTable>
        </div>
      </CardContent>
 </SectionCard>
  )
}
