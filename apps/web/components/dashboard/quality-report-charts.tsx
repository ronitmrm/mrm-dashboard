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
import { useActionState, useEffect, useRef, useState } from "react"
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
  annotation?: string
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

function axisLimit(maximum: number, fractional = false) {
  if (maximum <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4))
  const step = Math.ceil(maximum / 4 / magnitude) * magnitude
  return Math.max(fractional ? 0 : 1, step) * 4
}

/** Shared renderer: fixed chart proportions, readable values and bounded scrolling. */
function Plot({
  rows,
  series,
  horizontal = false,
  grouped = false,
  percentage = false,
  axisTitle = "Count",
  share = false,
  shiftProduction = false,
}: {
  rows: PlotRow[]
  series: Series[]
  horizontal?: boolean
  grouped?: boolean
  percentage?: boolean
  axisTitle?: string
  share?: boolean
  shiftProduction?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(620)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  if (!rows.length)
    return (
      <div ref={container}>
        <StandardState
          title="No records in this range"
          description="Choose another date range or unit."
        />
      </div>
    )
  const maximum = Math.max(
    0,
    ...rows.map((row) =>
      grouped || horizontal
        ? Math.max(...series.map((s) => row.values[s.key] ?? 0))
        : series.reduce((total, s) => total + (row.values[s.key] ?? 0), 0)
    )
  )
  const limit = axisLimit(maximum * 1.12, percentage)
  const rateLimit = axisLimit(
    Math.max(...rows.map((row) => row.percent ?? 0)) * 1.2,
    true
  )
  const hasRate =
    !shiftProduction && rows.some((row) => row.percent !== undefined)
  const width = Math.max(
    availableWidth - (horizontal ? 20 : 0),
    horizontal ? 420 : 480,
    horizontal ? 0 : rows.length * (grouped ? 150 : 110)
  )
  const height = horizontal ? Math.max(280, rows.length * 52 + 70) : 290
  const left = horizontal
    ? Math.min(
        175,
        Math.max(
          80,
          Math.max(...rows.map((row) => row.label.length)) * 7.5 + 14
        )
      )
    : 90
  const right = horizontal
    ? rows.some((row) => row.annotation)
      ? 190
      : share
        ? 135
        : 70
    : hasRate
      ? 65
      : 24
  const top = 34
  const bottom = height - (horizontal ? 44 : shiftProduction ? 65 : 40)
  const plotWidth = width - left - right
  const plotHeight = bottom - top
  const band = (horizontal ? plotHeight : plotWidth) / rows.length
  const total = rows.reduce((n, row) => n + (row.values.pieces ?? 0), 0)
  const labelText = (row: PlotRow) =>
    /^\d{2}\/\d{2}\/\d{4}$/.test(row.label) ? row.label.slice(0, 5) : row.label
  const rowTitle = (row: PlotRow) =>
    `${row.label}: ${series.map((s) => `${s.label} ${row.values[s.key] === null ? "No approvals" : number(row.values[s.key] ?? 0)}`).join(" | ")}${row.detail ? ` | ${row.detail}` : ""}`
  return (
    <div
      ref={container}
      className="grid min-w-0 gap-3"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <div
        className={horizontal ? "max-h-80 overflow-auto" : "overflow-x-auto"}
        tabIndex={0}
        role="region"
        aria-label={`${axisTitle} chart; scroll to view all entries`}
      >
        <svg
          role="img"
          aria-label={rows.map(rowTitle).join("; ")}
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full"
          style={{ width, minWidth: width, height }}
        >
          {Array.from({ length: 5 }, (_, i) => {
            const ratio = i / 4
            const x = left + plotWidth * ratio
            const y = bottom - plotHeight * ratio
            return (
              <g key={i}>
                <line
                  x1={horizontal ? x : left}
                  x2={horizontal ? x : width - right}
                  y1={horizontal ? top : y}
                  y2={horizontal ? bottom : y}
                  stroke="var(--border)"
                />
                <text
                  x={horizontal ? x : left - 10}
                  y={horizontal ? bottom + 20 : y + 4}
                  textAnchor={horizontal ? "middle" : "end"}
                  fontSize="14"
                  fill="var(--muted-foreground)"
                >
                  {number(limit * ratio)}
                  {percentage ? "%" : ""}
                </text>
              </g>
            )
          })}
          <line
            x1={left}
            x2={left}
            y1={top}
            y2={bottom}
            stroke="var(--muted-foreground)"
            opacity="0.5"
          />
          <line
            x1={left}
            x2={width - right}
            y1={bottom}
            y2={bottom}
            stroke="var(--muted-foreground)"
            opacity="0.5"
          />
          {share ? (
            <text
              x={width - 30}
              y={15}
              textAnchor="end"
              fontSize="14"
              fill="var(--muted-foreground)"
            >
              Share
            </text>
          ) : null}
          {rows.map((row, i) => {
            const center = (horizontal ? top : left) + band * (i + 0.5)
            let accumulated = 0
            const sum = series.reduce((n, s) => n + (row.values[s.key] ?? 0), 0)
            return (
              <g key={row.label}>
                <title>{rowTitle(row)}</title>
                <text
                  x={horizontal ? left - 12 : center}
                  y={horizontal ? center + 4 : bottom + 19}
                  textAnchor={horizontal ? "end" : "middle"}
                  fontSize="14"
                  fill="var(--foreground)"
                >
                  {labelText(row)}
                </text>
                {series.map((s, si) => {
                  const value = row.values[s.key]
                  const size =
                    ((value ?? 0) / limit) *
                    (horizontal ? plotWidth : plotHeight)
                  const thickness = horizontal
                    ? Math.min(30, band * 0.65)
                    : Math.min(grouped ? 90 : 150, band * 0.55) /
                      (grouped ? series.length : 1)
                  const base = accumulated
                  accumulated += size
                  const x = horizontal
                    ? left
                    : center -
                      (thickness * (grouped ? series.length : 1)) / 2 +
                      (grouped ? si * thickness : 0)
                  const y = horizontal
                    ? center - thickness / 2
                    : bottom - size - (grouped ? 0 : base)
                  const valueText =
                    value === null
                      ? "No approvals"
                      : `${number(value ?? 0)}${percentage ? "%" : ""}${row.annotation ? " min" : ""}`
                  const labelWidth = valueText.length * 8.5 + 8
                  const fitsInside =
                    value !== null &&
                    size >= (horizontal ? labelWidth : 22) &&
                    thickness >= (horizontal ? 22 : labelWidth)
                  return (
                    <g key={s.key}>
                      <rect
                        x={x}
                        y={y}
                        width={horizontal ? size : thickness}
                        height={horizontal ? thickness : size}
                        fill={s.color}
                      >
                        <title>{rowTitle(row)}</title>
                      </rect>
                      <text
                        x={
                          horizontal
                            ? fitsInside
                              ? left + size / 2
                              : left + size + 8
                            : fitsInside
                              ? x + thickness / 2
                              : x + thickness + 8
                        }
                        y={
                          horizontal
                            ? center + 4
                            : Math.min(bottom - 4, y + size / 2 + 4)
                        }
                        textAnchor={fitsInside ? "middle" : "start"}
                        fontSize="14"
                        fontWeight="600"
                        fill="#000000"
                      >
                        {valueText}
                      </text>
                      {horizontal && row.annotation && value !== null ? (
                        <text
                          x={
                            left + size + 9 + (fitsInside ? 0 : labelWidth + 8)
                          }
                          y={center + 4}
                          fontSize="13"
                          fill="var(--muted-foreground)"
                        >
                          {row.detail}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
                {!horizontal && !grouped && series.length > 1 ? (
                  <text
                    x={center}
                    y={bottom - (sum / limit) * plotHeight - 24}
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill="var(--foreground)"
                  >
                    {number(sum)}
                  </text>
                ) : null}
                {horizontal && share ? (
                  <text
                    x={width - 30}
                    y={center + 4}
                    textAnchor="end"
                    fontSize="14"
                    fill="var(--foreground)"
                  >
                    {number(
                      total ? ((row.values.pieces ?? 0) / total) * 100 : 0
                    )}
                    %
                  </text>
                ) : null}
                {shiftProduction ? (
                  <text
                    x={center}
                    y={bottom + 39}
                    textAnchor="middle"
                    fontSize="14"
                    fill="var(--muted-foreground)"
                  >
                    Rejection: {number(row.percent ?? 0)}%
                  </text>
                ) : null}
              </g>
            )
          })}
          {hasRate ? (
            <g>
              <polyline
                fill="none"
                stroke={colors.rejectionRate}
                strokeWidth="2.5"
                points={rows
                  .map(
                    (row, i) =>
                      `${left + band * (i + 0.5)},${bottom - ((row.percent ?? 0) / rateLimit) * plotHeight}`
                  )
                  .join(" ")}
              />
              {rows.map((row, i) => (
                <g key={row.label}>
                  <circle
                    cx={left + band * (i + 0.5)}
                    cy={bottom - ((row.percent ?? 0) / rateLimit) * plotHeight}
                    r="4"
                    fill={colors.rejectionRate}
                  />
                  <text
                    x={left + band * (i + 0.5)}
                    y={
                      bottom -
                      ((row.percent ?? 0) / rateLimit) * plotHeight -
                      10
                    }
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="600"
                    fill="var(--foreground)"
                  >
                    {number(row.percent ?? 0)}%
                  </text>
                </g>
              ))}
              {Array.from({ length: 5 }, (_, i) => (
                <text
                  key={i}
                  x={width - right + 10}
                  y={bottom - (i / 4) * plotHeight + 4}
                  fontSize="13"
                  fill="var(--muted-foreground)"
                >
                  {number((rateLimit * i) / 4)}%
                </text>
              ))}
            </g>
          ) : null}
          <text
            x={horizontal ? left + plotWidth / 2 : 15}
            y={horizontal ? height - 3 : top + plotHeight / 2}
            transform={
              horizontal ? undefined : `rotate(-90 15 ${top + plotHeight / 2})`
            }
            textAnchor="middle"
            fontSize="14"
            fill="var(--muted-foreground)"
          >
            {axisTitle}
          </text>
        </svg>
      </div>
      {!horizontal ? (
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-2">
              <span
                className="h-3 w-4 rounded-[2px]"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
          {hasRate ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-0.5 w-5"
                style={{ background: colors.rejectionRate }}
              />
              Rejection %
            </span>
          ) : null}
        </div>
      ) : null}
      {horizontal && rows.length > 6 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length} entries | Scroll within chart to view all
        </p>
      ) : null}
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
      { key: "pending", label: "Pending incl. earlier days", color: colors.pending },
    ]
    rows = buckets.map((row) => ({
      label: label(row),
      values: { approved: row.approved, pending: row.pending },
    }))
    summary = `Pending before range: ${number(data.pendingBefore)} · Approved in range: ${number(data.approvals)} · Pending at range end: ${number(data.pendingNow)}`
    description = shift
      ? "Approved in the selected range; pending at range end, including earlier days and Not OK. Grouped by Setting Done shift."
      : "Approved on each date; pending at each day's end (now for today), including earlier days and Not OK."
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
    summary = `Expected: ${number(sum("expected"))} · Completed: ${number(sum("completed"))} · Missed: ${number(sum("expected") - sum("completed"))} · Completion: ${number(sum("expected") ? (sum("completed") / sum("expected")) * 100 : 0)}%`
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
      annotation: time ? ` min (${number(row.approved)} approvals)` : undefined,
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
    grouped = true
    series = data.shifts.map((row, i) => ({
      key: row.label,
      label: row.label,
      color: [colors.good, colors.time, colors.rejected, colors.accent][i % 4]!,
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
      compact
      className="font-sans [--font-heading:Arial,sans-serif] [--font-sans:Arial,sans-serif] [&_[data-slot=card-description]]:text-base [&_[data-slot=card-title]]:text-xl"
      title={qualityCharts[id].title}
      actions={pinnable ? <PinQualityChartButton chartId={id} /> : undefined}
      description={
        <>
          <span
            className="flex flex-wrap gap-x-4 gap-y-1 text-base tabular-nums"
            style={{ fontFamily: "Arial, sans-serif" }}
          >
            {summary.split(" · ").map((item) => {
              const [name, ...value] = item.split(": ")
              return (
                <span key={name}>
                  {name}:{" "}
                  <strong className="font-bold text-foreground">
                    {value.join(": ")}
                  </strong>
                </span>
              )
            })}
          </span>
          <span className="sr-only">
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
        axisTitle={
          horizontal
            ? percentage
              ? "Rejection %"
              : id === "quality-inspector-time"
                ? "Average approval time (minutes)"
                : id === "quality-inspector-count"
                  ? "Number of approvals"
                  : "Rejected pieces"
            : id.includes("time") || id === "quality-approval-trend"
              ? "Minutes"
              : id.includes("production")
                ? "Pieces"
                : "Count"
        }
        share={id === "quality-daily-defects"}
        shiftProduction={id === "quality-shift-production"}
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
