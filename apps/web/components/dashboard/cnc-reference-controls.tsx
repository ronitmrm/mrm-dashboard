"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { MetricCard } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import type { CncDashboardData } from "@/lib/cnc-dashboard"

export type ReferenceTableData = NonNullable<
  CncDashboardData["tables"]
>[keyof NonNullable<CncDashboardData["tables"]>]
export const referenceSummary =
  "flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-primary [&::-webkit-details-marker]:hidden"
const format = new Intl.NumberFormat("en-IN").format

export function ReferenceTable({
  data,
  label,
  storageKey,
}: {
  data: ReferenceTableData
  label: string
  storageKey: string
}) {
  return (
    <OperationalTable
      aria-label={label}
      containerClassName="max-h-96"
      filterStorageKey={storageKey}
      state={data?.rows.length ? "ready" : "empty"}
      stateTitle="No matching records"
    >
      <TableHeader>
        <TableRow>
          {data?.columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.rows.map((row, index) => (
          <TableRow key={index}>
            {row.map((value, column) => (
              <TableCell className="align-top whitespace-pre-line" key={column}>
                {typeof value === "number" ? format(value) : value}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </OperationalTable>
  )
}

export function ReferenceDetails({
  expanded,
  title,
  children,
  pin,
}: {
  expanded?: boolean
  title: ReactNode
  children: ReactNode
  pin?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 border-t border-dotted pt-3">
      <details className="group min-w-0 flex-1" open={expanded}>
        <summary className={cn(referenceSummary, "py-1 text-sm")}>
          {title}
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 group-open:rotate-180"
          />
        </summary>
        <div className="mt-4 grid gap-3">{children}</div>
      </details>
      {pin}
    </div>
  )
}

export function ReferenceMetricDetail({
  className,
  label,
  value,
  unit,
  foot,
  featured,
  title,
  records,
  pin,
}: {
  className?: string
  label: string
  value: ReactNode
  unit?: string
  foot?: string
  featured?: boolean
  title: string
  records: ReferenceTableData
  pin?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="relative flex">
        <MetricCard
          className={cn(
            "min-h-36 w-full rounded-2xl pr-10 [&_div.uppercase]:tracking-normal [&_div.uppercase]:normal-case [&_span.tabular-nums]:text-3xl",
            className,
            featured &&
              "border-primary bg-primary hover:bg-primary [&_.text-muted-foreground]:text-primary-foreground/90 [&_span.tabular-nums]:text-primary-foreground"
          )}
          description={
            <>
              {foot}
              <span className="mt-2 block font-medium text-primary group-data-[tone=brand]/metric:text-primary-foreground">
                View details ↗
              </span>
            </>
          }
          label={label}
          onClick={() => setOpen(true)}
          tone={featured ? "brand" : "neutral"}
          unit={unit}
          value={value}
        />
        {pin ? (
          <div
            className={cn(
              "absolute top-4 right-3",
              featured && "[&_button]:text-primary-foreground"
            )}
          >
            {pin}
          </div>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(92vw,62rem)] sm:max-w-[min(92vw,62rem)]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <ReferenceTable data={records} label={title} storageKey={title} />
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ReferenceFleetHours({
  totals,
  records,
  pin,
}: {
  totals: { label: string; value: number }[]
  records: ReferenceTableData
  pin?: ReactNode
}) {
  const [machine, setMachine] = useState("")
  const selection = records?.rows.find((row) => row[0] === machine)
  const values = selection
    ? totals.map((row, index) => ({
        ...row,
        value: Number(selection[index + 1]),
      }))
    : totals
  const maximum = values[0]?.value || 1
  const availableHours = Math.max(
    0,
    (values[0]?.value ?? 0) - (values[4]?.value ?? 0)
  )
  const utilisation =
    availableHours > 0 ? ((values[1]?.value ?? 0) / availableHours) * 100 : null
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="cnc-fleet-machine">Machine</Label>
        <NativeSelect
          id="cnc-fleet-machine"
          value={machine}
          onChange={(event) => setMachine(event.target.value)}
        >
          <NativeSelectOption value="">
            All {records?.rows.length ?? 0} machines
          </NativeSelectOption>
          {records?.rows.map((row) => (
            <NativeSelectOption key={row[0]} value={String(row[0])}>
              {row[0]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        {values.map(({ label, value }, index) => (
          <div
            className={cn(
              "rounded-xl border bg-[#f7f7f2] p-3 dark:bg-muted/60",
              index === 0 && "bg-primary/10"
            )}
            key={label}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold text-primary">
              {format(value)}h
            </p>
          </div>
        ))}
        <MetricCard
          className="min-h-0 rounded-xl p-3 shadow-none [&_div.uppercase]:font-normal [&_div.uppercase]:tracking-normal [&_div.uppercase]:normal-case [&_span.tabular-nums]:text-xl [&_span.tabular-nums]:text-primary"
          label="Machine utilisation %"
          tone="brand"
          value={utilisation === null ? "—" : `${utilisation.toFixed(1)}%`}
        />
      </div>
      {values.length ? (
        <div
          aria-label="Allocation of recorded and unrecorded machine hours"
          className="flex h-3 overflow-hidden rounded-full bg-muted"
        >
          {values.slice(1).map(({ label, value }, index) => (
            <div
              key={label}
              className={
                ["bg-primary", "bg-[#e6b669]", "bg-[#c5cfbc]", "bg-[#b8d446]"][
                  index
                ]
              }
              style={{ width: `${(value / maximum) * 100}%` }}
              title={`${label}: ${format(value)} hours`}
            />
          ))}
        </div>
      ) : null}
      <ReferenceDetails title="Machine-wise time breakdown" pin={pin}>
        <ReferenceTable
          data={records}
          label="Machine-wise time breakdown"
          storageKey="cnc-reference-machine-hours"
        />
      </ReferenceDetails>
      <p className="text-xs text-muted-foreground">
        Breaks use the configured CNC schedule and take precedence over
        overlapping recorded stops. Session coverage comes from ERP start and
        close timestamps. Time without session evidence remains unclassified.
        Machine utilisation is session time excluding stops divided by total
        fleet hours less planned breaks.
      </p>
    </div>
  )
}

export function ReferencePriorityWatchlist({
  records,
  exportHref,
  title,
}: {
  records: ReferenceTableData
  exportHref: string
  title: string
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("open")
  const rows = records?.rows ?? []
  const open = rows.filter((row) => row[5] !== "Unmatched")
  const found = rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "open" && row[5] !== "Unmatched") ||
        (filter === "changed" && row[6] === "Yes") ||
        (filter === "unmatched" && row[5] === "Unmatched")) &&
      [row[1], row[2]].some((cell) =>
        String(cell).toLowerCase().includes(search.trim().toLowerCase())
      )
  )
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border bg-[#eef3e5] px-4 py-3 dark:bg-primary/10">
        {[
          [open.length, "open orders"],
          [
            open.filter((row) => row[5] === "In production").length,
            "in production",
          ],
          [
            open.filter((row) => row[5] === "Ready for setup").length,
            "ready for setup",
          ],
          [
            open.filter((row) => row[5] === "Partially dispatched").length,
            "partially dispatched",
          ],
        ].map(([count, label]) => (
          <span className="text-xs text-muted-foreground" key={label}>
            <strong className="mr-1.5 text-2xl font-semibold text-primary">
              {count}
            </strong>
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {open.slice(0, 3).map((row, index) => (
          <div
            className="rounded-lg border bg-[#f7f7f2] px-3 py-2 text-xs dark:bg-muted/60"
            key={index}
          >
            <strong>
              {row[1]} · {row[2]}
            </strong>
            <br />
            {row[5]}
          </div>
        ))}
      </div>
      <ReferenceDetails
        title={`View open priority orders · ${open.length} orders`}
      >
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Search item or job card"
            placeholder="Search item or job card…"
            type="search"
            className="max-w-64"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <NativeSelect
            aria-label="Filter priority changes"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <NativeSelectOption value="open">Open orders</NativeSelectOption>
            <NativeSelectOption value="all">
              All priority orders
            </NativeSelectOption>
            <NativeSelectOption value="changed">
              Changed in selection
            </NativeSelectOption>
            <NativeSelectOption value="unmatched">Unmatched</NativeSelectOption>
          </NativeSelect>
          <Button asChild size="sm" variant="outline">
            <a href={exportHref}>Export priority log</a>
          </Button>
        </div>
        <ReferenceTable
          data={{
            columns: [
              "Priority decision",
              "Item / job",
              "Current stage",
              "Current job progress / outcome",
              "Estimated finish / latest output",
            ],
            rows: found.map(
              ([
                at,
                part,
                job,
                machine,
                priority,
                stage,
                changed,
                progress,
                finish,
                output,
              ]) => [
                `${priority === "—" ? "—" : `Priority ${priority}`}\n${at}${changed === "Yes" ? " · Changed in selection" : ""}`,
                `${part}\n${job}`,
                `${stage}${machine === "—" ? "" : `\n${machine}`}`,
                progress === "—" ? "—" : `${progress} of final setup quantity`,
                [finish, output]
                  .filter((value) => value != null && value !== "—")
                  .join("\n") || "—",
              ]
            ),
          }}
          label={title}
          storageKey="cnc-priority-watchlist"
        />
      </ReferenceDetails>
    </div>
  )
}
