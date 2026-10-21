"use client"

import type {
  QualityBucket,
  QualityReportData,
} from "@workspace/db/quality-report-domain"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { useActionState, useState } from "react"
import { Pin, Check, LoaderCircle } from "lucide-react"
import { pinQualityChart } from "@/app/home/actions"
import { qualityCharts, type QualityChartId } from "@/lib/quality-reports"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import { ChartCard } from "./dashboard-components"

const colors = {
  good: "var(--color-positive)",
  rejected: "var(--color-danger)",
  pending: "var(--color-warning)",
  time: "var(--color-info)",
  accent: "var(--chart-5)",
  rejectionRate: "var(--chart-rejection-rate)",
}
const number = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
const percent = (good: number, rejected: number) =>
  good + rejected ? (rejected / (good + rejected)) * 100 : 0
type Series = { key: string; label: string; color: string }
type PlotRow = {
  label: string
  values: Record<string, number | null>
  detail?: string
  percent?: number
}

export function QualityReportFilters({
  from,
  to,
  unit,
  floors,
}: {
  from: string
  to: string
  unit: string
  floors: readonly { code: string; label: string }[]
}) {
  return (
    <form className="flex flex-wrap items-end gap-3" method="get">
      <div className="grid gap-1">
        <Label htmlFor="quality-from">From</Label>
        <Input
          id="quality-from"
          name="from"
          type="date"
          defaultValue={from}
          required
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="quality-to">To</Label>
        <Input
          id="quality-to"
          name="to"
          type="date"
          defaultValue={to}
          required
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="quality-unit">Unit</Label>
        <NativeSelect id="quality-unit" name="unit" defaultValue={unit}>
          <NativeSelectOption value="">All permitted units</NativeSelectOption>
          {floors.map((floor) => (
            <NativeSelectOption value={floor.code} key={floor.code}>
              {floor.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" size="sm">
        Apply
      </Button>
    </form>
  )
}

function PinQualityChartButton({ chartId }: { chartId: QualityChartId }) {
  const [state, action, pending] = useActionState(pinQualityChart, {
    status: "idle",
    message: "",
  })
  const pinned = state.status === "pinned" || state.status === "already-pinned"
  return (
    <form action={action}>
      <input type="hidden" name="chartId" value={chartId} />
      <Button
        size="icon-xs"
        variant="ghost"
        type="submit"
        disabled={pending || pinned}
        title={pinned ? state.message : "Add to My Dashboard"}
        aria-label={`Add ${qualityCharts[chartId].title} to My Dashboard`}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" />
        ) : pinned ? (
          <Check />
        ) : (
          <Pin />
        )}
      </Button>
      <span
        role="status"
        className={
          state.status === "error" ? "text-xs text-destructive" : "sr-only"
        }
      >
        {state.message}
      </span>
    </form>
  )
}

function HorizontalPlot({
  rows,
  series,
  percentage,
}: {
  rows: PlotRow[]
  series: Series[]
  percentage: boolean
}) {
  const [page, setPage] = useState(0)
  const pageSize = series.length > 1 ? 4 : 6
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
  const currentPage = Math.min(page, lastPage)
  const visible = rows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )
  const maximum = Math.max(
    1,
    ...rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0))
  )
  const chartName = series.map((s) => s.label).join(" / ")
  return (
    <div className="grid min-w-0 gap-3">
      <div
        className="grid h-80 content-start gap-4 overflow-y-auto pr-1"
        role="img"
        aria-label={visible
          .map(
            (row) =>
              `${row.label}: ${series.map((s) => `${s.label} ${row.values[s.key] === null ? "No approvals" : number(row.values[s.key] ?? 0)}`).join(", ")}`
          )
          .join("; ")}
      >
        {visible.map((row) => (
          <div className="grid gap-1.5" key={row.label} title={row.detail}>
            <span className="text-sm font-medium break-words">{row.label}</span>
            {series.map((s) => (
              <div
                key={s.key}
                className="flex min-w-0 items-center gap-3"
                title={`${row.label}: ${s.label} ${number(row.values[s.key] ?? 0)}${percentage ? "%" : ""}`}
              >
                {series.length > 1 ? (
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">
                    {s.label}
                  </span>
                ) : null}
                <div className="h-2 min-w-0 flex-1 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${((row.values[s.key] ?? 0) / maximum) * 100}%`,
                      background: s.color,
                    }}
                  />
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  {row.values[s.key] === null
                    ? "No approvals"
                    : `${number(row.values[s.key] ?? 0)}${percentage ? "%" : ""}`}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span role="status">
          {currentPage * pageSize + 1}–
          {Math.min((currentPage + 1) * pageSize, rows.length)} of {rows.length}
        </span>
        {lastPage > 0 ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={`${chartName}: Previous entries`}
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={`${chartName}: Next entries`}
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Shared chart renderer used unchanged in reports and personal dashboards. */
function Plot({
  rows,
  series,
  horizontal = false,
  grouped = false,
  percentage = false,
}: {
  rows: PlotRow[]
  series: Series[]
  horizontal?: boolean
  grouped?: boolean
  percentage?: boolean
}) {
  if (!rows.length)
    return (
      <StandardState
        title="No records in this range"
        description="Choose another date range or unit."
      />
    )
  if (horizontal)
    return (
      <HorizontalPlot rows={rows} series={series} percentage={percentage} />
    )
  const showBreakdown =
    series[0]?.key === "approved" || series[0]?.key === "completed"
  const max = Math.max(
    1,
    ...rows.map((row) =>
      grouped
        ? Math.max(...Object.values(row.values).map((v) => v ?? 0))
        : series.reduce((sum, s) => sum + (row.values[s.key] ?? 0), 0)
    )
  )
  const magnitude = 10 ** Math.floor(Math.log10(max / 4))
  const step = Math.max(1, Math.ceil(max / 4 / magnitude) * magnitude)
  const limit = step * 4
  const percentLimit = Math.max(
    1,
    Math.ceil(Math.max(...rows.map((row) => row.percent ?? 0)))
  )
  const left = horizontal ? 180 : 58
  const categoryWidth = showBreakdown ? 110 : 62
  const width = Math.max(650, rows.length * categoryWidth)
  const height = showBreakdown ? 335 : 285
  const top = 22,
    bottom = height - (showBreakdown ? 95 : 45),
    plotWidth = width - left - 58,
    plotHeight = bottom - top
  const band = (horizontal ? plotHeight : plotWidth) / rows.length
  return (
    <div className="grid min-w-0 gap-3">
      <div className="overflow-auto">
        <svg
          role="img"
          aria-label={rows
            .map(
              (row) =>
                `${row.label}: ${series.map((s) => `${s.label} ${row.values[s.key] === null ? "No approvals" : number(row.values[s.key] ?? 0)}`).join(", ")}${row.percent === undefined ? "" : `, rejection ${number(row.percent)}%`}`
            )
            .join("; ")}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{
            minWidth: horizontal
              ? "28rem"
              : `${Math.max(360, rows.length * categoryWidth)}px`,
            maxHeight: horizontal ? undefined : "20rem",
          }}
        >
          {Array.from({ length: 5 }, (_, i) => {
            const ratio = i / 4
            return (
              <g key={i}>
                <line
                  x1={horizontal ? left + plotWidth * ratio : left}
                  x2={horizontal ? left + plotWidth * ratio : width - 58}
                  y1={horizontal ? top : bottom - plotHeight * ratio}
                  y2={horizontal ? bottom : bottom - plotHeight * ratio}
                  stroke="var(--border)"
                />
                <text
                  x={horizontal ? left + plotWidth * ratio : left - 8}
                  y={horizontal ? bottom + 18 : bottom - plotHeight * ratio + 4}
                  textAnchor={horizontal ? "middle" : "end"}
                  fill="var(--muted-foreground)"
                  fontSize="11"
                >
                  {number(limit * ratio)}
                </text>
              </g>
            )
          })}
          {rows.map((row, index) => {
            let accumulated = 0
            const center = (horizontal ? top : left) + band * (index + 0.5)
            return (
              <g key={row.label}>
                <title>{row.detail || row.label}</title>
                <text
                  x={horizontal ? left - 10 : center}
                  y={horizontal ? center + 4 : bottom + 18}
                  textAnchor={horizontal ? "end" : "middle"}
                  fontSize="11"
                  fill="var(--foreground)"
                >
                  {horizontal || !/^\d{2}\/\d{2}\/\d{4}$/.test(row.label)
                    ? row.label
                    : row.label.slice(0, 5)}
                </text>
                {series.map((s, si) => {
                  const value = row.values[s.key]
                  const size =
                    ((value ?? 0) / limit) *
                    (horizontal ? plotWidth : plotHeight)
                  const thickness =
                    Math.min(34, band * 0.65) / (grouped ? series.length : 1)
                  const base = accumulated
                  accumulated += size
                  const shift = grouped
                    ? si * thickness - (series.length * thickness) / 2
                    : -thickness / 2
                  const x = horizontal
                    ? left + (grouped ? 0 : base)
                    : center + shift
                  const y = horizontal
                    ? center + shift
                    : bottom - size - (grouped ? 0 : base)
                  return (
                    <g key={s.key}>
                      <rect
                        x={x}
                        y={y}
                        width={horizontal ? size : thickness}
                        height={horizontal ? thickness : size}
                        fill={s.color}
                      >
                        <title>{`${row.label}: ${series.map((item) => `${item.label} ${row.values[item.key] === null ? "No approvals" : number(row.values[item.key] ?? 0)}`).join(" · ")}${row.detail ? ` · ${row.detail}` : ""}`}</title>
                      </rect>
                      {horizontal && !grouped ? (
                        <text
                          x={left + size + 6}
                          y={center + 4}
                          fontSize="11"
                          fill="var(--foreground)"
                        >
                          {value === null
                            ? "No approvals"
                            : `${number(value ?? 0)}${percentage ? "%" : ""}`}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
                {showBreakdown
                  ? series.map((s, index) => (
                      <text
                        key={`count-${s.key}`}
                        x={center}
                        y={bottom + 38 + index * 17}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill="var(--foreground)"
                      >{`${s.key === "pending" ? "Pending" : s.label}: ${number(row.values[s.key] ?? 0)}`}</text>
                    ))
                  : null}
                {!horizontal ? (
                  <text
                    x={center}
                    y={Math.max(
                      12,
                      bottom -
                        ((grouped
                          ? Math.max(
                              ...Object.values(row.values).map((v) => v ?? 0)
                            )
                          : Object.values(row.values).reduce<number>(
                              (s, v) => s + (v ?? 0),
                              0
                            )) /
                          limit) *
                          plotHeight -
                        7
                    )}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--foreground)"
                  >
                    {Object.values(row.values).every((value) => value === null)
                      ? "—"
                      : number(
                          Object.values(row.values).reduce<number>(
                            (s, v) => s + (v ?? 0),
                            0
                          )
                        )}
                  </text>
                ) : null}
              </g>
            )
          })}
          {!horizontal && rows.some((row) => row.percent !== undefined) ? (
            <g>
              <polyline
                fill="none"
                stroke={colors.rejectionRate}
                strokeWidth="3"
                points={rows
                  .map(
                    (row, i) =>
                      `${left + band * (i + 0.5)},${bottom - ((row.percent ?? 0) / percentLimit) * plotHeight}`
                  )
                  .join(" ")}
              />
              {rows.map((row, i) => (
                <g key={row.label}>
                  <circle
                    cx={left + band * (i + 0.5)}
                    cy={
                      bottom - ((row.percent ?? 0) / percentLimit) * plotHeight
                    }
                    r="3"
                    fill={colors.rejectionRate}
                  />
                  <text
                    x={left + band * (i + 0.5)}
                    y={
                      bottom -
                      ((row.percent ?? 0) / percentLimit) * plotHeight -
                      8
                    }
                    textAnchor="middle"
                    fill={colors.rejectionRate}
                    fontSize="10"
                  >
                    {number(row.percent ?? 0)}%
                  </text>
                </g>
              ))}
              {[0, 25, 50, 75, 100].map((value) => (
                <text
                  key={value}
                  x={width - 50}
                  y={bottom - (value / 100) * plotHeight + 4}
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  {number((value / 100) * percentLimit)}%
                </text>
              ))}
            </g>
          ) : null}
        </svg>
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
        {rows.some((row) => row.percent !== undefined) ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4"
              style={{ background: colors.rejectionRate }}
            />
            Rejection % (right axis)
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function QualityReportChart({
  id,
  data,
  pinnable = true,
}: {
  id: QualityChartId
  data: QualityReportData
  pinnable?: boolean
}) {
  const shift = id.startsWith("quality-shift-")
  const buckets = shift ? data.shifts : data.daily
  const sum = (key: keyof Omit<QualityBucket, "label">, items = buckets) =>
    items.reduce((n, row) => n + row[key], 0)
  const avg = (items = buckets) =>
    sum("timed", items) ? sum("minutes", items) / sum("timed", items) : null
  const fmtAvg = (items = buckets) =>
    avg(items) === null ? "No approvals" : `${number(avg(items)!)} min`
  const label = (row: QualityBucket) =>
    shift ? row.label : formatCalendarDate(row.label)
  let rows: PlotRow[] = [],
    series: Series[] = [],
    summary = "",
    description = "",
    horizontal = false,
    grouped = false,
    percentage = false
  if (id === "quality-production" || id === "quality-shift-production") {
    series = [
      { key: "good", label: "Accepted", color: colors.good },
      { key: "rejected", label: "Rejected", color: colors.rejected },
    ]
    rows = buckets.map((row) => ({
      label: label(row),
      values: { good: row.good, rejected: row.rejected },
      percent: percent(row.good, row.rejected),
    }))
    summary = `Produced: ${number(sum("good") + sum("rejected"))} · Accepted: ${number(sum("good"))} · Rejected: ${number(sum("rejected"))} · Rejection: ${number(percent(sum("good"), sum("rejected")))}%`
    description =
      "All setup operations; quantities count each operation, not unique finished pieces."
  } else if (
    id === "quality-first-piece" ||
    id === "quality-shift-first-piece"
  ) {
    series = [
      { key: "approved", label: "Approved", color: colors.good },
      { key: "pending", label: "Pending incl. Not OK", color: colors.pending },
    ]
    rows = buckets.map((row) => ({
      label: label(row),
      values: { approved: row.approved, pending: row.pending },
    }))
    summary = `Pending before range: ${number(data.pendingBefore)} · Approved in range: ${number(data.approvals)} · Pending at range end: ${number(data.pendingNow)}`
    description =
      "Bars group requests by Setting Done date/shift. Not OK remains pending until approved."
  } else if (id === "quality-approval-trend" || id === "quality-shift-time") {
    series = [
      { key: "minutes", label: "Average elapsed minutes", color: colors.time },
    ]
    rows = buckets.map((row) => ({
      label: label(row),
      values: { minutes: row.timed ? row.minutes / row.timed : null },
      detail: `${row.timed} timed approvals`,
    }))
    summary = `Average: ${fmtAvg()} · Timed approvals: ${number(sum("timed"))}`
    description =
      "Setting Done → QC approval; includes overnight and non-working time."
  } else if (id === "quality-hourly" || id === "quality-shift-hourly") {
    series = [
      { key: "completed", label: "Completed", color: colors.good },
      { key: "missed", label: "Missed", color: colors.pending },
    ]
    rows = buckets.map((row) => ({
      label: label(row),
      values: {
        completed: row.completed,
        missed: row.expected - row.completed,
      },
    }))
    summary = `Expected: ${number(sum("expected"))} · Completed: ${number(sum("completed"))} · Missed: ${number(sum("expected") - sum("completed"))}`
    description =
      "One check per completed running machine-hour. Downtime excluded; checks must match that hour."
  } else if (
    id === "quality-inspector-count" ||
    id === "quality-inspector-time"
  ) {
    horizontal = true
    const time = id === "quality-inspector-time"
    series = [
      {
        key: "value",
        label: time ? "Average elapsed minutes" : "Approvals",
        color: time ? colors.time : colors.good,
      },
    ]
    rows = data.inspectors.map((row) => ({
      label: row.label,
      values: {
        value: time
          ? row.timed
            ? row.minutes / row.timed
            : null
          : row.approved,
      },
      detail: `${row.approved} approvals`,
    }))
    summary = time
      ? `Average: ${fmtAvg(data.inspectors)} · Approvals: ${data.approvals}`
      : `Approvals: ${data.approvals} · Inspectors: ${data.inspectors.length}`
    description = time
      ? "Setting Done → approval, including overnight and non-working hours."
      : "Each request counted once when approved; includes inspectors with zero approvals."
  } else if (
    id === "quality-machine-percent" ||
    id === "quality-machine-pieces"
  ) {
    horizontal = true
    percentage = id === "quality-machine-percent"
    series = [
      {
        key: "value",
        label: percentage ? "Rejection %" : "Rejected pieces",
        color: colors.rejected,
      },
    ]
    rows = data.machines
      .filter((row) => row.good + row.rejected > 0)
      .map((row) => ({
        label: row.label,
        values: {
          value: percentage ? percent(row.good, row.rejected) : row.rejected,
        },
        detail: `Produced ${number(row.good + row.rejected)} · Accepted ${number(row.good)} · Rejected ${number(row.rejected)} · ${number(percent(row.good, row.rejected))}%`,
      }))
      .sort((a, b) => (b.values.value ?? 0) - (a.values.value ?? 0))
    summary = `Produced: ${number(sum("good", data.machines) + sum("rejected", data.machines))} · Rejected: ${number(sum("rejected", data.machines))} · Rejection: ${number(percent(sum("good", data.machines), sum("rejected", data.machines)))}%`
    description =
      "All setup operations and rejection types; includes machines with production and zero rejection."
  } else if (id === "quality-shift-defects") {
    horizontal = true
    grouped = true
    series = data.shifts.map((row, i) => ({
      key: row.label,
      label: row.label,
      color: [colors.time, colors.pending, colors.accent, colors.rejected][
        i % 4
      ]!,
    }))
    rows = data.shiftDefects.map((row) => ({
      label: row.label,
      values: row.values,
    }))
    summary = `Rejected: ${number(data.defects.reduce((n, row) => n + row.pieces, 0))} · Defects: ${data.defects.length}`
  } else {
    horizontal = true
    series = [
      { key: "pieces", label: "Rejected pieces", color: colors.rejected },
    ]
    const total = data.defects.reduce((n, row) => n + row.pieces, 0)
    rows = data.defects.map((row) => ({
      label: row.label,
      values: { pieces: row.pieces },
      detail: `${number(row.pieces)} pieces · ${number(total ? (row.pieces / total) * 100 : 0)}% of rejections`,
    }))
    summary = `Rejected: ${number(total)} · Defects: ${data.defects.length}`
    description =
      "All production rejection types; running and completed Job Cards."
  }
  return (
    <ChartCard
      title={qualityCharts[id].title}
      actions={pinnable ? <PinQualityChartButton chartId={id} /> : undefined}
      description={
        <>
          <span className="block text-foreground tabular-nums">{summary}</span>
          <span className="block text-xs">
            {description}
            {shift
              ? " First-piece status and approval time belong to the Setting Done shift."
              : ""}
          </span>
        </>
      }
    >
      <Plot
        rows={rows}
        series={series}
        horizontal={horizontal}
        grouped={grouped}
        percentage={percentage}
      />
    </ChartCard>
  )
}

export function QualityChartGrid({
  ids,
  data,
  pinnable = true,
}: {
  ids: QualityChartId[]
  data: QualityReportData
  pinnable?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      {ids.map((id) => (
        <div
          key={id}
          className={
            id === "quality-production" ||
            id === "quality-shift-production" ||
            ids.length === 1
              ? "min-w-0 xl:col-span-2"
              : "min-w-0"
          }
        >
          <QualityReportChart id={id} data={data} pinnable={pinnable} />
        </div>
      ))}
    </div>
  )
}
