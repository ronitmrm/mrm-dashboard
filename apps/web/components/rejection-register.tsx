"use client"
import { useCallback, useState } from "react"
import type { RejectionRegisterRow } from "@workspace/db/rejection-domain"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@workspace/ui/components/table"
import { MetricSummary } from "@/components/ui/golden-patterns"

export function RejectionRegister({ rows }: { rows: RejectionRegisterRow[] }) {
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null)
  const onFiltered = useCallback(
    (ids: string[]) =>
      setFilteredIds((previous) =>
        previous?.length === ids.length &&
        previous.every((id, i) => id === ids[i])
          ? previous
          : ids
      ),
    []
  )
  const ids = filteredIds ? new Set(filteredIds) : null
  const visible = ids ? rows.filter((row) => ids.has(row.id)) : rows
  const pieces = visible.reduce((sum, row) => sum + row.pieces, 0)
  const kg = visible.reduce((sum, row) => sum + (row.kg ?? 0), 0)
  const missing = visible.filter((row) => row.kg === null).length
  return (
    <div className="grid min-w-0 gap-4">
      <MetricSummary
        scope="Matching rejection entries · selected dates, unit and table filters"
        items={[
          { label: "Entries", value: visible.length, tone: "information" },
          { label: "Rejected pieces", value: pieces, tone: "warning" },
          {
            label: "Known rejection kg",
            value: Math.round(kg * 1000) / 1000,
            tone: "warning",
          },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        Kg includes entered weights and weights calculated from saved session
        piece weights. {missing} matching entries have no recorded weight.
      </p>
      <OperationalTable
        onFilteredRowIdsChange={onFiltered}
        filterStorageKey="rejection-register"
        containerClassName="max-h-[65vh] rounded-lg border"
        state={rows.length ? "ready" : "empty"}
        stateTitle="No rejections"
        stateDescription="No rejection entries match the selected dates and unit."
        toolbarStart={
          <span className="text-sm font-medium">Rejection Register</span>
        }
      >
        <TableHeader>
          <TableRow>
            {[
              "Job Card",
              "Part code",
              "Date",
              "Unit",
              "Stage",
              "Type",
              "Defect",
              "Reason",
              "Pcs",
              "Kg",
              "Weight basis",
            ].map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} data-row-id={row.id}>
              <TableCell>{row.jobCard}</TableCell>
              <TableCell>{row.partCode}</TableCell>
              <TableCell>{row.date}</TableCell>
              <TableCell>{row.unit}</TableCell>
              <TableCell>{row.stage}</TableCell>
              <TableCell>{row.type || "—"}</TableCell>
              <TableCell>{row.defect || "—"}</TableCell>
              <TableCell>{row.reason || "—"}</TableCell>
              <TableCell className="tabular-nums">{row.pieces}</TableCell>
              <TableCell className="tabular-nums">
                {row.kg === null ? "—" : row.kg.toFixed(3)}
              </TableCell>
              <TableCell>{row.weightBasis}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={8}>Filtered totals</TableCell>
            <TableCell>{pieces}</TableCell>
            <TableCell>{kg.toFixed(3)}</TableCell>
            <TableCell>
              {missing ? `${missing} weights unavailable` : ""}
            </TableCell>
          </TableRow>
        </TableFooter>
      </OperationalTable>
    </div>
  )
}
