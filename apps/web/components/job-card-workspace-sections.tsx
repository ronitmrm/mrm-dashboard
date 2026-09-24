import { StatusBadge } from "@workspace/ui/components/badge"
import { SectionCard, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import Link from "next/link"

import { formatIstDateTime } from "@/lib/date-time"

type Row = Record<string, unknown>
const text = (value: unknown) => String(value ?? "").trim()
const number = (value: unknown) => Number(value) || 0
const quantity = (value: unknown) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(number(value))

export function SetupProduction({ rows, setups, orderedQuantity }: { rows: Row[]; setups: Row[]; orderedQuantity: unknown }) {
  return <SectionCard>
    <CardHeader><CardTitle>Good Production by Setup</CardTitle><CardDescription>Updates automatically every 10 seconds while this page is visible, and when you return. Each setup has an equal share of overall completion.</CardDescription></CardHeader>
    <CardContent>
      <OperationalTable containerClassName="rounded-md border" filterStorageKey="job-card-setup-production">
        <TableHeader><TableRow><TableHead>Setup</TableHead><TableHead>Operation</TableHead><TableHead className="text-right">Good Pieces</TableHead><TableHead className="text-right">Order Pieces</TableHead><TableHead className="text-right">Setup Complete</TableHead><TableHead className="text-right">Job Card Contribution</TableHead></TableRow></TableHeader>
        <TableBody>{rows.length ? rows.map((row) => {
          const setup = setups.find((candidate) => text(candidate.setupNumber) === text(row.setupNumber))
          return <TableRow key={text(row.setupNumber)}>
            <TableCell>Setup {text(row.setupNumber)}</TableCell><TableCell>{text(setup?.operationName || setup?.operationCode) || "-"}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{quantity(row.actualGoodPieces)}</TableCell><TableCell className="text-right tabular-nums">{quantity(orderedQuantity)}</TableCell>
            <TableCell className="text-right tabular-nums">{quantity(row.completionPercent)}%</TableCell><TableCell className="text-right tabular-nums">{quantity(number(row.completionPercent) / rows.length)}%</TableCell>
          </TableRow>
        }) : <TableRow><TableCell colSpan={6}>Select a route to see setup production.</TableCell></TableRow>}</TableBody>
      </OperationalTable>
    </CardContent>
  </SectionCard>
}

export function JobCardQualityRecords({ rows, floor }: { rows: Row[]; floor: ProductionFloorCode }) {
  return <>{([
    { kind: "first_piece", title: "First-Piece Inspection Reports", path: "/dashboard/first-piece-inspection/report", parameter: "reportId" },
    { kind: "hourly", title: "Hourly Check Records", path: "/dashboard/hourly-quality-check/report", parameter: "checkId" },
  ] as const).map(({ kind, title, path, parameter }) => {
    const records = rows.filter((row) => row.kind === kind)
    return <SectionCard key={kind}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent><OperationalTable containerClassName="max-h-[32rem] rounded-md border" filterStorageKey={`job-card-quality-${kind}`}>
        <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Setup</TableHead><TableHead>Route</TableHead><TableHead>Machine</TableHead><TableHead>Checked By</TableHead><TableHead>Status</TableHead><TableHead>Report</TableHead></TableRow></TableHeader>
        <TableBody>{records.length ? records.map((row) => <TableRow key={text(row.id)}>
          <TableCell>{formatIstDateTime(text(row.checkedAt))}</TableCell><TableCell>{text(row.setupNumber)}</TableCell><TableCell>{text(row.routeCode)}</TableCell><TableCell>{text(row.machineNumber) || "-"}</TableCell><TableCell>{text(row.checkedBy) || "-"}</TableCell><TableCell><StatusBadge value={text(row.status)} /></TableCell>
          <TableCell>{row.reportKey ? <Link className="font-medium text-primary underline underline-offset-4" href={`${path}?${new URLSearchParams({ floor, [parameter]: text(row.reportKey) })}`}>Open report</Link> : "Unavailable"}</TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={7}>No saved records for this Job Card.</TableCell></TableRow>}</TableBody>
      </OperationalTable></CardContent>
    </SectionCard>
  })}</>
}
