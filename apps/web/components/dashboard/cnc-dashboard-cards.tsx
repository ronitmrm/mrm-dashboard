import Link from "next/link"
import type { ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"
import { MetricCard } from "@workspace/ui/components/card"
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

import {
  cncDashboardCards,
  cncShifts,
  type CncDashboardCardId,
  type CncDashboardData,
  type CncDashboardFilters,
} from "@/lib/cnc-dashboard"
import {
  ChartCard,
  DashboardBarChart,
  DashboardErrorState,
  DataTableCard,
  FilterBar,
} from "./dashboard-components"

const formatNumber = new Intl.NumberFormat("en-IN").format

export const cncReferenceMetricClass =
  "min-h-[149px] rounded-2xl border-[#dfe3d8] px-4 py-5 shadow-none xl:px-[22px] xl:py-[23px] dark:border-border [&>span[aria-hidden]]:hidden [&_div.truncate]:whitespace-normal [&_div.uppercase]:pr-4 [&_div.uppercase]:font-normal [&_div.uppercase]:tracking-normal [&_div.uppercase]:normal-case [&_.line-clamp-2]:line-clamp-none [&_.line-clamp-2]:text-[11px] [&_.line-clamp-2]:leading-relaxed [&_[data-slot=metric-card-action]]:absolute [&_[data-slot=metric-card-action]]:top-4 [&_[data-slot=metric-card-action]]:right-3 [&_span.tabular-nums]:mt-2 [&_span.tabular-nums]:text-[clamp(1.625rem,2.9vw,2.375rem)] [&_span.tabular-nums]:leading-tight [&_span.tabular-nums]:text-primary"

export const cncReferenceFeaturedMetricClass =
  "border-primary bg-primary [&_.text-muted-foreground]:text-primary-foreground/90 [&_button]:text-primary-foreground [&_span.tabular-nums]:text-primary-foreground"

export function CncDashboardHeading({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions: ReactNode
}) {
  return (
    <div className="mb-1 flex flex-wrap items-center justify-between gap-5">
      <div className="min-w-0">
        <p className="mb-3 text-[10px] font-semibold tracking-[.17em] text-primary uppercase before:mb-3 before:block before:h-1 before:w-8 before:rounded-full before:bg-[#b8d446]">
          CNC Operations · Command Centre
        </p>
        <h1 className="text-[clamp(25px,2.5vw,36px)] leading-[1.15] font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions}
    </div>
  )
}

export function CncDashboardFilterBar({
  filters,
  sessionCount,
  action = "/home",
  qualitySummary,
  summary,
}: {
  filters: CncDashboardFilters
  sessionCount?: number
  action?: string
  qualitySummary?: ReactNode
  summary?: ReactNode
}) {
  const monthSummary = qualitySummary ?? summary
  const filterField = monthSummary
    ? "flex flex-wrap items-center gap-2"
    : "grid gap-1.5"
  const dateClass = monthSummary
    ? "h-[42px] w-[148px] bg-background"
    : undefined
  return (
    <form action={action} key={JSON.stringify(filters)}>
      <FilterBar
        className={
          monthSummary
            ? "gap-x-3 gap-y-4 rounded-xl p-4 shadow-none sm:p-5"
            : "rounded-xl"
        }
        label={
          qualitySummary ? "CNC quality filters" : "CNC production filters"
        }
      >
        {monthSummary ? null : (
          <span className="self-center text-sm font-semibold text-primary">
            CNC-01
          </span>
        )}
        <div className={filterField}>
          <Label htmlFor="cnc-dashboard-from">From</Label>
          <Input
            defaultValue={filters.from}
            className={dateClass}
            id="cnc-dashboard-from"
            name="from"
            required
            type="date"
          />
        </div>
        <div className={filterField}>
          <Label htmlFor="cnc-dashboard-to">To</Label>
          <Input
            defaultValue={filters.to}
            className={dateClass}
            id="cnc-dashboard-to"
            name="to"
            required
            type="date"
          />
        </div>
        <div className={cn(filterField, monthSummary && "sm:border-l sm:pl-4")}>
          <Label htmlFor="cnc-dashboard-shift">
            {monthSummary ? "Select shift" : "Shift"}
          </Label>
          <NativeSelect
            className={
              monthSummary
                ? "h-[42px] min-w-44 bg-background xl:min-w-60"
                : undefined
            }
            defaultValue={filters.shift}
            id="cnc-dashboard-shift"
            name="shift"
          >
            <NativeSelectOption value="all">All shifts</NativeSelectOption>
            {cncShifts.map((shift) => (
              <NativeSelectOption key={shift} value={shift}>
                Shift {shift}
                {monthSummary
                  ? {
                      A: " · 06:00–14:00",
                      B: " · 14:00–22:00",
                      C: " · 22:00–06:00",
                    }[shift]
                  : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {monthSummary ? (
          <>
            <output className="basis-full text-xs text-muted-foreground sm:text-right">
              {monthSummary}
            </output>
            <div className="flex basis-full flex-wrap items-center gap-3 border-t border-dotted pt-3">
              <div className={filterField}>
                <Label htmlFor="cnc-dashboard-month">View month</Label>
                <Input
                  defaultValue={filters.from.slice(0, 7)}
                  className="h-9 w-[208px] max-w-full bg-background"
                  id="cnc-dashboard-month"
                  name="month"
                  type="month"
                />
              </div>
              <Button
                name="applyMonth"
                value="1"
                type="submit"
                variant="outline"
              >
                Apply month
              </Button>
              <Button type="submit">Apply filters</Button>
            </div>
          </>
        ) : null}
        {monthSummary ? null : <Button type="submit">Apply filters</Button>}
        {!monthSummary && sessionCount !== undefined ? (
          <output className="self-center text-sm text-muted-foreground">
            {formatNumber(sessionCount)}{" "}
            {sessionCount === 1 ? "session" : "sessions"}
          </output>
        ) : null}
      </FilterBar>
      {filters.from > filters.to ? (
        <DashboardErrorState
          description="Choose an end date on or after the start date."
          title="Check your dates"
        />
      ) : null}
    </form>
  )
}

export function CncDashboardCard({
  data,
  href,
  id,
  pin,
}: {
  data: CncDashboardData | null
  href: string
  id: CncDashboardCardId
  pin?: ReactNode
}) {
  const [title, , description] = cncDashboardCards[id]
  const actions = (
    <div className="flex items-start gap-1">
      <Button asChild size="sm" variant="ghost">
        <Link href={href}>View records</Link>
      </Button>
      {pin}
    </div>
  )
  const table = data?.tables?.[id]
  if (table) {
    return (
      <DataTableCard
        actions={actions}
        className="col-span-full rounded-2xl"
        description={description}
        title={title}
      >
        <OperationalTable
          aria-label={title}
          containerClassName="max-h-96"
          filterStorageKey={id}
          state={table.rows.length ? "ready" : "empty"}
          stateTitle="No matching records"
        >
          <TableHeader>
            <TableRow>
              {table.columns.map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row, index) => (
              <TableRow key={index}>
                {row.map((value, column) => (
                  <TableCell key={column}>
                    {typeof value === "number" ? formatNumber(value) : value}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </OperationalTable>
      </DataTableCard>
    )
  }
  if (id === "cnc-machine-output" && data) {
    return (
      <DataTableCard
        actions={actions}
        className="col-span-full rounded-2xl"
        description={description}
        title={title}
      >
        <OperationalTable
          aria-label={title}
          containerClassName="max-h-96"
          filterStorageKey="personal-dashboard-cnc-machine-breakdown"
          state={data.machines.length ? "ready" : "empty"}
          stateTitle="No machine sessions in this selection"
        >
          <TableHeader>
            <TableRow>
              <TableHead>Machine</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Rejected</TableHead>
              <TableHead className="text-right">Downtime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.machines.map((row) => (
              <TableRow key={row.machine}>
                <TableCell className="font-medium">{row.machine}</TableCell>
                <TableCell className="max-w-96 whitespace-normal">
                  {row.jobs.join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.produced)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.rejected)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.downtime)} min
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </OperationalTable>
      </DataTableCard>
    )
  }
  const rows = data?.charts[id]
  if (rows) {
    const unit = [
      "cnc-downtime-reasons",
      "cnc-setup-duration",
      "cnc-qc-wait",
    ].includes(id)
      ? " min"
      : ["cnc-machine-hours", "cnc-fleet-hours"].includes(id)
        ? " hr"
        : ""
    return (
      <ChartCard
        actions={actions}
        className="rounded-2xl sm:col-span-2"
        compact
        description={description}
        empty={rows.length === 0}
        emptyDescription="There are no matching records for this selection."
        title={title}
      >
        {id === "cnc-shift-comparison" ? (
          <dl className="grid grid-cols-3 gap-2">
            {rows.map(({ label, value }) => (
              <div className="rounded-xl bg-primary/8 p-3" key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-lg font-semibold text-primary tabular-nums">
                  {formatNumber(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <DashboardBarChart
            formatValue={
              unit ? (value) => formatNumber(value) + unit : undefined
            }
            rows={rows}
          />
        )}
      </ChartCard>
    )
  }

  const value = data?.values[id]
  if (value === undefined) {
    if (!data) return null
    return (
      <MetricCard
        action={pin}
        description="Source records are temporarily unavailable."
        label={title}
        tone="neutral"
        value="—"
      />
    )
  }
  const featured = id === "cnc-pieces-produced"
  return (
    <MetricCard
      action={pin}
      className={cn(
        "min-h-36 rounded-2xl [&_div.uppercase]:tracking-normal [&_div.uppercase]:normal-case [&_span.tabular-nums]:text-4xl",
        featured &&
          "border-primary bg-primary [&_.text-muted-foreground]:text-primary-foreground/85 [&_span.tabular-nums]:text-primary-foreground"
      )}
      description={description}
      label={title}
      tone={featured ? "brand" : "neutral"}
      unit={
        [
          "cnc-logged-downtime",
          "cnc-maintenance-duration",
          "cnc-qc-average-wait",
          "cnc-setup-avg-minutes",
          "cnc-setup-recorded-minutes",
        ].includes(id)
          ? "min"
          : [
                "cnc-floor-efficiency",
                "cnc-operator-efficiency",
                "cnc-rejection-rate",
              ].includes(id)
            ? "%"
            : undefined
      }
      value={value === null ? "—" : formatNumber(value)}
    />
  )
}
