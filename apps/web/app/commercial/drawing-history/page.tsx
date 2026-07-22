import {
  createCommercialReportingRepository,
  createCustomerRepository,
} from "@workspace/db"
import { Download, Pencil, RotateCcw } from "lucide-react"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { updateDrawingHistoryAction } from "./actions"

const drawingHistoryPath = "/commercial/drawing-history"

export default async function DrawingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; revision?: string }>
}) {
  await requireCapability("pricing.masters.read", drawingHistoryPath)
  const filters = await searchParams
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  let rows
  try {
    rows = await repository.listDrawingHistory({
      organizationId: await customers.organizationIdForCode("MRMPL"),
      query: filters.q,
      revision: filters.revision,
    })
  } finally {
    await repository.close()
    await customers.close()
  }
  const editing = rows.find((row) => row.drawingId === filters.edit)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Drawing History</CardTitle>
              <CardDescription>
                Revision-keyed production drawing control. Revision 0 rows are
                created atomically when approved Q products become internal
                products.
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href={`${drawingHistoryPath}/export.xlsx`}>
                <Download /> Export Excel
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto]">
            <Input
              aria-label="Search drawing history"
              defaultValue={filters.q}
              name="q"
              placeholder="Search UID, drawing or remarks"
            />
            <Input
              aria-label="Filter revision"
              defaultValue={filters.revision}
              name="revision"
              placeholder="Revision"
            />
            <Button type="submit">Apply filters</Button>
            <Button asChild variant="ghost">
              <Link href={drawingHistoryPath}>
                <RotateCcw /> Reset
              </Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit {editing.uid}</CardTitle>
            <CardDescription>
              Drawing number, revision, effective date, archived laminated
              quantities, and remarks remain auditable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateDrawingHistoryAction} className="grid gap-4">
              <input
                name="drawing_id"
                type="hidden"
                value={editing.drawingId}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-2">
                  <Label htmlFor="drawing_number">Drawing No.</Label>
                  <Input
                    defaultValue={editing.drawingNumber}
                    id="drawing_number"
                    name="drawing_number"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="revision">Revision No.</Label>
                  <Input
                    defaultValue={editing.revision}
                    id="revision"
                    name="revision"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="revision_date">Rev Date</Label>
                  <Input
                    defaultValue={editing.revisionDate}
                    id="revision_date"
                    name="revision_date"
                    required
                    type="date"
                  />
                </div>
                {[
                  [
                    "buffoli_laminated_quantity",
                    "Buffoli",
                    editing.buffoliLaminatedQuantity,
                  ],
                  [
                    "conventional_laminated_quantity",
                    "Conventional",
                    editing.conventionalLaminatedQuantity,
                  ],
                  [
                    "cnc_laminated_quantity",
                    "CNC",
                    editing.cncLaminatedQuantity,
                  ],
                ].map(([name, label, defaultValue]) => (
                  <div className="grid gap-2" key={String(name)}>
                    <Label htmlFor={String(name)}>{label} laminated qty</Label>
                    <Input
                      defaultValue={String(defaultValue)}
                      id={String(name)}
                      min={0}
                      name={String(name)}
                      step={1}
                      type="number"
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  defaultValue={editing.remarks ?? ""}
                  id="remarks"
                  name="remarks"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save Drawing History</Button>
                <Button asChild variant="outline">
                  <Link href={drawingHistoryPath}>Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Production Drawing Control</CardTitle>
          <CardDescription>
            {rows.length} matching revision rows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sr. No.</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead>UID</TableHead>
                  <TableHead>Drawing No.</TableHead>
                  <TableHead>Revision</TableHead>
                  <TableHead>Rev Date</TableHead>
                  <TableHead>Laminated B / C / CNC</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.drawingId}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.itemDescription}</TableCell>
                      <TableCell className="font-mono">{row.uid}</TableCell>
                      <TableCell className="font-mono">
                        {row.drawingNumber}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.revision}</Badge>
                      </TableCell>
                      <TableCell>{row.revisionDate}</TableCell>
                      <TableCell>
                        {row.buffoliLaminatedQuantity} /{" "}
                        {row.conventionalLaminatedQuantity} /{" "}
                        {row.cncLaminatedQuantity}
                      </TableCell>
                      <TableCell>{row.remarks || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            href={`${drawingHistoryPath}?edit=${row.drawingId}`}
                          >
                            <Pencil /> Edit
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-muted-foreground"
                      colSpan={9}
                    >
                      No drawing history rows match these filters.
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
