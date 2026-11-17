import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
  SectionCard,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import {
  cncDashboardCards,
  type CncDashboardCardId,
  type CncDashboardData,
  type CncDashboardDepartment,
  type CncDashboardFilters,
} from "@/lib/cnc-dashboard"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"
import {
  CncDashboardFilterBar,
  CncDashboardHeading,
  cncReferenceFeaturedMetricClass,
  cncReferenceMetricClass,
} from "./cnc-dashboard-cards"
import {
  ReferenceDetails,
  ReferenceFleetHours,
  ReferenceMetricDetail,
  ReferencePriorityWatchlist,
  ReferenceTable,
  type ReferenceTableData,
} from "./cnc-reference-controls"
import { PinDashboardMetricButton } from "./pin-dashboard-metric-button"

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
  .format
const dayAndMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
})
const tint = "rounded-xl bg-[#eef3e5] dark:bg-primary/10"
const subheading = "text-xs text-muted-foreground"
const caption = {
  production:
    "CNC overview · recorded production, machine activity and session-based capacity",
  machinist:
    "Machinist · setup workload, machine settings and recorded downtime",
  "shop-floor":
    "Shop Floor · material placement, operator efficiency and dispatch",
  maintenance:
    "Maintenance · open breakdowns, planned work and recorded maintenance time",
  planning: "Planning · priority decisions and current job progress",
} as const

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <SectionCard className="min-w-0 rounded-[20px] border-[#dce4d5] shadow-none dark:border-border">
      {title ? (
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </div>
          {action}
        </CardHeader>
      ) : null}
      <CardContent>{children}</CardContent>
    </SectionCard>
  )
}

function Bars({
  rows,
  unit = "",
}: {
  rows: { label: string; value: number }[]
  unit?: string
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.value))
  return rows.length ? (
    <ul className="grid gap-3">
      {rows.map(({ label, value }) => (
        <li className="grid gap-1.5" key={label}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{label}</span>
            <b className="shrink-0">
              {number(value)}
              {unit}
            </b>
          </div>
          <div
            aria-hidden="true"
            className="h-[7px] overflow-hidden rounded-full bg-[#edf1e4] dark:bg-primary/15"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(100 * value) / maximum}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      No recorded values in this selection.
    </p>
  )
}

function Columns({
  groups,
  comparison,
}: {
  groups: { label: string; actual: number; capacity?: number }[]
  comparison?: boolean
}) {
  if (!groups.length)
    return (
      <p className="text-sm text-muted-foreground">
        No recorded values in this selection.
      </p>
    )
  const max = Math.max(
    1,
    ...groups.flatMap(({ actual, capacity }) => [actual, capacity ?? 0])
  )
  return (
    <div className="grid gap-3">
      {comparison ? (
        <div className="flex justify-end gap-4 text-xs text-muted-foreground">
          <span>
            <i className="mr-1 inline-block size-2 rounded-sm bg-primary" />
            Actual
          </span>
          <span>
            <i className="mr-1 inline-block size-2 rounded-sm bg-[#b8d446]" />
            Session capacity
          </span>
        </div>
      ) : null}
      <div className="flex gap-3 overflow-x-auto pt-5 pb-2">
        {groups.map(({ label, actual, capacity }) => (
          <div
            key={label}
            className={cn(
              "grid flex-1 gap-1 text-center",
              comparison ? "min-w-28" : "min-w-[72px]"
            )}
          >
            <div className="flex h-36 items-end justify-center gap-1.5 border-b border-border px-1">
              <div
                className="relative w-full max-w-12 rounded-t-sm bg-primary"
                style={{ height: `${(100 * actual) / max}%` }}
                title={`Actual: ${number(actual)} pcs`}
              >
                <span className="absolute inset-x-0 bottom-full mb-1 text-[10px] font-medium text-primary">
                  {number(actual)}
                </span>
              </div>
              {capacity !== undefined ? (
                <div
                  className="relative w-full max-w-12 rounded-t-sm bg-[#b8d446]"
                  style={{ height: `${(100 * capacity) / max}%` }}
                  title={`Capacity: ${number(capacity)} pcs`}
                >
                  <span className="absolute inset-x-0 bottom-full mb-1 text-[10px] font-medium text-foreground">
                    {number(capacity)}
                  </span>
                </div>
              ) : null}
            </div>
            <span className={subheading}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Counts({ values }: { values: [ReactNode, string][] }) {
  return (
    <div className={cn(tint, "flex flex-wrap gap-x-6 gap-y-2 px-5 py-4")}>
      {values.map(([value, label]) => (
        <span className={subheading} key={label}>
          <strong className="mr-1.5 text-2xl font-semibold text-primary">
            {value}
          </strong>
          {label}
        </span>
      ))}
    </div>
  )
}

type UserWork = {
  machine: string
  job: string
  part: string
  at: string
  minutes?: number | null
}
function People({
  items,
  setup,
}: {
  items: Map<string, UserWork[]>
  setup?: boolean
}) {
  return items.size ? (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[...items]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([name, rows]) => {
          const timed = rows.flatMap(({ minutes }) =>
            minutes == null ? [] : [minutes]
          )
          const average = timed.length
            ? timed.reduce((total, value) => total + value, 0) / timed.length
            : null
          return (
            <div
              className="grid gap-3 rounded-2xl border border-[#dce4d5] bg-[#f7f7f2] p-4 dark:border-border dark:bg-muted/60"
              key={name}
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e4edd8] text-xs font-semibold text-[#006a49]"
                >
                  {name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")}
                </span>
                <strong className="text-sm">{name}</strong>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className={subheading}>
                    {setup ? "Settings completed" : "Material placements"}
                  </dt>
                  <dd className="text-2xl font-semibold text-primary">
                    {rows.length}
                  </dd>
                </div>
                <div className="border-l pl-3">
                  <dt className={subheading}>
                    {setup ? "Average setup time" : "Machines served"}
                  </dt>
                  <dd className="text-2xl font-semibold text-primary">
                    {setup
                      ? average === null
                        ? "—"
                        : `${average.toFixed(1)} min`
                      : new Set(rows.map(({ machine }) => machine)).size}
                  </dd>
                </div>
              </dl>
              {setup ? (
                <p className={subheading}>
                  {timed.length} / {rows.length} settings with recorded timing
                </p>
              ) : null}
              <ReferenceDetails
                title={setup ? "Machines & settings" : "Machines & tasks"}
              >
                <ul className="grid gap-2 text-xs">
                  {rows.map((row, index) => (
                    <li key={index}>
                      <strong>{row.machine}</strong> · {row.part} / {row.job}
                      <br />
                      {row.at} IST
                      {row.minutes != null
                        ? ` · ${number(row.minutes)} min`
                        : ""}
                    </li>
                  ))}
                </ul>
              </ReferenceDetails>
            </div>
          )
        })}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      No completions recorded in this selection.
    </p>
  )
}

function recordedPeople(entries: (UserWork & { user: string })[]) {
  const groups = new Map<string, UserWork[]>()
  for (const { user, ...entry } of entries) {
    const group = groups.get(user) ?? []
    group.push(entry)
    groups.set(user, group)
  }
  return groups
}

const kpis: Record<
  Exclude<CncDashboardDepartment, "quality">,
  readonly CncDashboardCardId[]
> = {
  production: [
    "cnc-pieces-produced",
    "cnc-good-pieces",
    "cnc-pieces-rejected",
    "cnc-logged-downtime",
    "cnc-operator-efficiency",
  ],
  machinist: [
    "cnc-setup-workload",
    "cnc-setups-completed",
    "cnc-setup-pending",
    "cnc-setup-recorded-minutes",
    "cnc-machinist-downtime",
  ],
  "shop-floor": [
    "cnc-floor-placements",
    "cnc-floor-operators",
    "cnc-floor-efficiency",
  ],
  maintenance: [
    "cnc-open-breakdowns",
    "cnc-maintenance-planned",
    "cnc-maintenance-completed",
    "cnc-maintenance-duration",
  ],
  planning: [],
}
const labels: Partial<Record<CncDashboardCardId, string>> = {
  "cnc-pieces-produced": "Recorded output",
  "cnc-logged-downtime": "Recorded downtime",
  "cnc-maintenance-completed": "Planned maintenance completed",
  "cnc-maintenance-duration": "Avg maintenance time",
}
const minuteCards = new Set([
  "cnc-logged-downtime",
  "cnc-setup-recorded-minutes",
  "cnc-machinist-downtime",
  "cnc-maintenance-duration",
])
const percentCards = new Set([
  "cnc-floor-efficiency",
  "cnc-operator-efficiency",
])
const pieceCards = new Set([
  "cnc-pieces-produced",
  "cnc-good-pieces",
  "cnc-pieces-rejected",
])

export function CncReferenceDashboard({
  actions,
  department,
  data,
  filters,
  availableIds,
  pinnedIds,
}: {
  actions: ReactNode
  department: Exclude<CncDashboardDepartment, "quality">
  data: CncDashboardData | null
  filters: CncDashboardFilters
  availableIds: ReadonlySet<CncDashboardCardId>
  pinnedIds: ReadonlySet<string>
}) {
  const shift =
    filters.shift === "all" ? "All shifts" : `Shift ${filters.shift}`
  const date =
    filters.from === filters.to
      ? dayAndMonth.format(new Date(`${filters.from}T00:00:00Z`))
      : `${formatIstDate(filters.from)} – ${formatIstDate(filters.to)}`
  const href = `/home/${department}`
  const values = data?.values
  const allowed = (id: CncDashboardCardId) => availableIds.has(id)
  const chart = (id: CncDashboardCardId) => data?.charts[id] ?? []
  const table = (id: CncDashboardCardId) => data?.tables?.[id]
  const value = (id: CncDashboardCardId) =>
    values?.[id] == null ? "—" : number(values[id])
  const pin = (id: CncDashboardCardId) =>
    allowed(id) ? (
      <PinDashboardMetricButton
        cardId={id}
        title={labels[id] ?? cncDashboardCards[id][0]}
        alreadyPinned={pinnedIds.has(id)}
      />
    ) : null
  const tableDetails = (
    id: CncDashboardCardId,
    title: string = cncDashboardCards[id][0],
    expanded?: boolean
  ) =>
    allowed(id) ? (
      <ReferenceDetails title={title} pin={pin(id)} expanded={expanded}>
        <ReferenceTable data={table(id)} label={title} storageKey={id} />
      </ReferenceDetails>
    ) : null
  const watchlist = (
    <Panel
      title="Planner priority changes → current progress"
      subtitle="Priority history through the selected shift and current recorded job progress"
      action={
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild size="sm" variant="outline">
            <Link href="/?tab=productionControlTab&floor=cnc">
              Open planner
            </Link>
          </Button>
          {pin("cnc-planner-priorities")}
        </div>
      }
    >
      <ReferencePriorityWatchlist
        records={table("cnc-planner-priorities")}
        exportHref={`/home/planning/export.csv?${new URLSearchParams(filters)}`}
        title="Priority changes and progress"
      />
    </Panel>
  )
  const maintenance = table("cnc-maintenance-work")
  const maintenanceRows = (
    test: (row: (number | string)[]) => boolean
  ): ReferenceTableData =>
    maintenance
      ? { columns: maintenance.columns, rows: maintenance.rows.filter(test) }
      : undefined
  const metricDetails: Partial<
    Record<CncDashboardCardId, { title: string; records: ReferenceTableData }>
  > = {
    "cnc-machinist-downtime": allowed("cnc-machinist-downtime-log")
      ? {
          title: "Machinist-entered production downtime",
          records: table("cnc-machinist-downtime-log"),
        }
      : undefined,
    "cnc-open-breakdowns": {
      title: "Machines in open breakdown",
      records: table("cnc-breakdown-log"),
    },
    "cnc-maintenance-planned": {
      title: "Planned maintenance jobs",
      records: maintenanceRows((row) => row[2] === "Plan"),
    },
    "cnc-maintenance-completed": {
      title: "Completed planned maintenance",
      records: maintenanceRows(
        (row) =>
          row[2] === "Completed" && String(row[5]).toLowerCase() === "planned"
      ),
    },
    "cnc-maintenance-duration": {
      title: "Maintenance time breakdown",
      records: maintenanceRows(
        (row) => row[2] === "Completed" && typeof row[4] === "number"
      ),
    },
  }
  const workload = data?.setupWorkload
  const capacityRows = chart("cnc-production-capacity")
  const capacityGroups = capacityRows
    .filter((row) => row.label.endsWith(" · Actual"))
    .map((row) => {
      const label = row.label.replace(" · Actual", "")
      return {
        label,
        actual: row.value,
        capacity: capacityRows.find(
          (candidate) => candidate.label === `${label} · Session capacity`
        )?.value,
      }
    })
  const totalActual = capacityGroups.reduce((sum, row) => sum + row.actual, 0)
  const totalCapacity = capacityGroups.reduce(
    (sum, row) => sum + (row.capacity ?? 0),
    0
  )
  const shiftSummary = `${shift} · ${data?.sessionCount ?? 0} recorded sessions`
  const banner = {
    production: `${data?.sessionCount ?? 0} sessions · ${value("cnc-pieces-produced")} pieces · ${value("cnc-logged-downtime")} min recorded downtime`,
    machinist: workload
      ? `${workload.received} received · ${workload.approvals.length} completed · ${workload.pending.length} pending at shift end`
      : "Setup workload",
    "shop-floor": `${value("cnc-floor-placements")} material placements completed · ${value("cnc-floor-operators")} recorded operators`,
    maintenance: `${value("cnc-open-breakdowns")} open breakdowns · ${value("cnc-maintenance-planned")} planned · ${value("cnc-maintenance-completed")} planned completions`,
    planning: `${table("cnc-planner-priorities")?.rows.length ?? 0} priority records`,
  }[department]
  return (
    <div className="grid gap-5">
      <CncDashboardHeading
        actions={actions}
        title={`${date} · ${shift}`}
        description={caption[department]}
      />
      <CncDashboardFilterBar
        action={href}
        filters={filters}
        summary={
          department === "production" ? shiftSummary : `${shift} · ${banner}`
        }
      />
      {data ? (
        <>
          <div
            className={cn(
              tint,
              "flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs"
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-primary"
              />
              <strong className="text-primary">{shift}</strong>
              <span>{banner}</span>
            </div>
          </div>
          {department === "production" ? (
            <Panel>
              <ReferenceDetails title="Full-day source downloads (all shifts)">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "cnc-machine-output",
                      "cnc-downtime-log",
                      "cnc-rejection-log",
                      "cnc-setup-log",
                      "cnc-qc-log",
                    ] as const
                  )
                    .filter(allowed)
                    .map((id) => (
                      <Button asChild size="sm" variant="outline" key={id}>
                        <a
                          href={`${href}/export.csv?${new URLSearchParams({ ...filters, shift: "all", card: id })}`}
                        >
                          {cncDashboardCards[id][0]}
                        </a>
                      </Button>
                    ))}
                </div>
              </ReferenceDetails>
            </Panel>
          ) : null}
          {kpis[department].some(allowed) ? (
            <section
              aria-label="Key performance indicators"
              className={cn(
                "grid grid-cols-2 gap-4 md:grid-cols-3",
                department === "shop-floor"
                  ? "lg:grid-cols-3"
                  : department === "maintenance"
                    ? "lg:grid-cols-4"
                    : "lg:grid-cols-5"
              )}
            >
              {kpis[department].filter(allowed).map((id, index) => {
                const label = labels[id] ?? cncDashboardCards[id][0]
                const duration =
                  id === "cnc-setup-recorded-minutes" ||
                  id === "cnc-machinist-downtime"
                    ? values?.[id]
                    : undefined
                const displayValue =
                  duration == null
                    ? value(id)
                    : `${Math.floor(Math.round(duration) / 60)}h ${String(Math.round(duration) % 60).padStart(2, "0")}m`
                const unit =
                  values?.[id] == null || duration != null
                    ? undefined
                    : minuteCards.has(id)
                      ? "min"
                      : percentCards.has(id)
                        ? "%"
                        : pieceCards.has(id)
                          ? "pcs"
                          : undefined
                const foot =
                  id === "cnc-good-pieces" &&
                  Number(values?.["cnc-pieces-produced"]) > 0
                    ? `${((Number(values?.[id]) / Number(values?.["cnc-pieces-produced"])) * 100).toFixed(2)}% recorded good ratio`
                    : cncDashboardCards[id][2]
                const detail = metricDetails[id]
                return detail ? (
                  <ReferenceMetricDetail
                    key={id}
                    className={cncReferenceMetricClass}
                    label={label}
                    value={displayValue}
                    unit={unit}
                    foot={foot}
                    featured={index === 0}
                    title={detail.title}
                    records={detail.records}
                    pin={pin(id)}
                  />
                ) : (
                  <MetricCard
                    key={id}
                    action={pin(id)}
                    className={cn(
                      cncReferenceMetricClass,
                      index === 0 && cncReferenceFeaturedMetricClass
                    )}
                    description={foot}
                    label={label}
                    tone={index === 0 ? "brand" : "neutral"}
                    unit={unit}
                    value={displayValue}
                  />
                )
              })}
            </section>
          ) : null}
          {department === "production" ? (
            <>
              {allowed("cnc-shift-comparison") ? (
                <Panel>
                  <ReferenceDetails
                    title="Compare all three shifts"
                    pin={pin("cnc-shift-detail")}
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      {table("cnc-shift-detail")?.rows.map(
                        ([label, pieces, rejected, downtime, sessions]) => (
                          <div key={label} className={cn(tint, "p-4")}>
                            <p className="text-xs text-muted-foreground">
                              {label}
                            </p>
                            <p className="text-2xl font-semibold text-primary">
                              {number(Number(pieces))} pcs
                            </p>
                            <p className={subheading}>
                              {sessions} sessions · {rejected} rejected ·{" "}
                              {downtime} min downtime
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </ReferenceDetails>
                </Panel>
              ) : null}
              {allowed("cnc-machine-activity") ? (
                <Panel
                  title={`Machine activity · ${shift}`}
                  subtitle="Recorded session evidence across the selected shifts"
                  action={pin("cnc-machine-activity")}
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(
                      [
                        "Ran in shift",
                        "No shift record",
                        "Recorded downtime",
                      ] as const
                    ).map((title) => {
                      const all = table("cnc-machine-activity")
                      const records = all && {
                        ...all,
                        rows: all.rows.filter((row) =>
                          title === "Recorded downtime"
                            ? Number(row[3]) > 0
                            : row[2] === title
                        ),
                      }
                      return (
                        <ReferenceMetricDetail
                          key={title}
                          label={title}
                          title={title}
                          records={records}
                          value={records?.rows.length ?? 0}
                          foot={
                            title === "No shift record"
                              ? "Status unknown"
                              : "Recorded machine evidence"
                          }
                        />
                      )
                    })}
                  </div>
                </Panel>
              ) : null}
              {allowed("cnc-rejection-log") || allowed("cnc-qc-completed") ? (
                <Panel
                  title={`Quality overview · ${shift}`}
                  subtitle="Recorded rejection defects, causes and first-piece approvals"
                >
                  {allowed("cnc-qc-completed") ? (
                    <Counts
                      values={[
                        [
                          value("cnc-qc-completed"),
                          "first-piece approvals given",
                        ],
                        [
                          value("cnc-qc-average-wait"),
                          "avg first-piece approval wait (min)",
                        ],
                      ]}
                    />
                  ) : null}
                  {tableDetails(
                    "cnc-qc-log",
                    "Approved machines and approval wait"
                  )}
                  {allowed("cnc-rejection-log") ? (
                    <div className="my-4 grid gap-5 md:grid-cols-2">
                      <div>
                        <strong className="mb-3 block">
                          Rejection reasons
                        </strong>
                        <Bars
                          rows={chart("cnc-rejection-reasons")}
                          unit=" pcs"
                        />
                      </div>
                      <div>
                        <strong className="mb-3 block">Recorded causes</strong>
                        <Bars
                          rows={chart("cnc-rejection-causes")}
                          unit=" pcs"
                        />
                      </div>
                    </div>
                  ) : null}
                  {tableDetails(
                    "cnc-rejection-log",
                    "Affected machines, parts and rejection stage"
                  )}
                </Panel>
              ) : null}
              {allowed("cnc-setups-completed") ? (
                <Panel
                  title={`Machinist overview · ${shift}`}
                  subtitle="Setting completion and recorded setup time"
                >
                  <Counts
                    values={[
                      [
                        value("cnc-sessions-started"),
                        "production session starts",
                      ],
                      [
                        value("cnc-machines-reporting"),
                        "machines reporting production",
                      ],
                      [value("cnc-setups-completed"), "setups completed"],
                      [
                        value("cnc-setup-avg-minutes"),
                        "avg reported setup time (min)",
                      ],
                    ]}
                  />
                  {tableDetails(
                    "cnc-setup-log",
                    "Completed setups and durations"
                  )}
                </Panel>
              ) : null}
              {allowed("cnc-open-breakdowns") ? (
                <Panel
                  title={`Maintenance overview · ${shift}`}
                  subtitle="Current mechanical breakdowns and recorded production stops"
                >
                  <Counts
                    values={[
                      [
                        value("cnc-maintenance-breakdowns-intersecting"),
                        "open breakdown records intersecting shift",
                      ],
                      [
                        value("cnc-maintenance-breakdowns-started"),
                        "breakdowns started in selection",
                      ],
                      [
                        value("cnc-logged-downtime"),
                        "production-session stop time (min)",
                      ],
                      [
                        `${value("cnc-maintenance-repairs")} / ${value("cnc-maintenance-repair-avg")}`,
                        "repairs completed / avg repair time (min)",
                      ],
                    ]}
                  />
                  {tableDetails(
                    "cnc-breakdown-log",
                    "Open mechanical breakdowns"
                  )}
                  {tableDetails(
                    "cnc-maintenance-backlog",
                    "Preventive maintenance backlog · current snapshot"
                  )}
                </Panel>
              ) : null}
              {allowed("cnc-fleet-hours") ? (
                <Panel
                  title="Machine availability"
                  subtitle={`${shift} · elapsed shift hours`}
                  action={pin("cnc-fleet-hours")}
                >
                  <ReferenceFleetHours
                    totals={chart("cnc-fleet-hours")}
                    records={table("cnc-machine-hours-detail")}
                    pin={pin("cnc-machine-hours-detail")}
                  />
                </Panel>
              ) : null}
              {allowed("cnc-production-capacity") ? (
                <Panel
                  title="Session-based capacity vs actual"
                  subtitle={`${shift} · job session time less planned breaks`}
                  action={pin("cnc-production-capacity")}
                >
                  <div className="grid gap-4">
                    <Columns groups={capacityGroups} comparison />
                    <Counts
                      values={[
                        [number(totalActual), "actual pieces"],
                        [
                          totalCapacity ? number(totalCapacity) : "—",
                          "session capacity",
                        ],
                        [
                          totalCapacity
                            ? `${((totalActual / totalCapacity) * 100).toFixed(1)}%`
                            : "—",
                          "actual / capacity",
                        ],
                      ]}
                    />
                    <ReferenceDetails title="How is capacity calculated?">
                      <p className={subheading}>
                        Capacity uses recorded session time less planned breaks
                        and the applicable piece cycle standard. Logged stops
                        remain in available session time. Sessions without an
                        applicable time standard contribute to actual output
                        only.
                      </p>
                    </ReferenceDetails>
                    {tableDetails("cnc-machine-capacity")}
                  </div>
                </Panel>
              ) : null}
              {allowed("cnc-machine-output") ? (
                <Panel>
                  <ReferenceDetails
                    title="Machine production breakdown"
                    pin={pin("cnc-machine-output")}
                  >
                    <ReferenceTable
                      data={{
                        columns: [
                          "Machine",
                          "Jobs",
                          "Output",
                          "Rejected",
                          "Downtime (min)",
                        ],
                        rows: data.machines.map((row) => [
                          row.machine,
                          row.jobs.join(", "),
                          row.produced,
                          row.rejected,
                          row.downtime,
                        ]),
                      }}
                      label="Machine production breakdown"
                      storageKey="cnc-reference-machine-production"
                    />
                  </ReferenceDetails>
                </Panel>
              ) : null}
              <Panel title="Needs attention" subtitle="Day notes">
                <p className="text-sm">
                  {value("cnc-open-sessions")} open sessions in the selection.
                </p>
                <p className={subheading}>
                  Machines without a session have unknown activity for the
                  selected shift.
                </p>
                <ReferenceDetails title="Data sources & definitions">
                  <p className={subheading}>
                    Figures use CNC production sessions and recorded workflow,
                    maintenance, and planning records. Current operational
                    snapshots are labeled separately from selected-shift
                    results.
                  </p>
                </ReferenceDetails>
              </Panel>
              {allowed("cnc-planner-priorities") ? (
                <ReferenceDetails title="Planner priority watchlist">
                  {watchlist}
                </ReferenceDetails>
              ) : null}
            </>
          ) : null}
          {department === "machinist" ? (
            <>
              {workload ? (
                <Panel
                  title="Setup workload vs completed"
                  subtitle={`${shift} · material placement, setting completion and replanning`}
                >
                  <Counts
                    values={[
                      [workload.carryIn, "carry-in"],
                      [workload.received, "new setups"],
                      [workload.moved, "replanned"],
                      [workload.approvals.length, "completed"],
                      [workload.pending.length, "pending"],
                    ]}
                  />
                </Panel>
              ) : null}
              {allowed("cnc-machinist-downtime-log") ? (
                <Panel>
                  {tableDetails(
                    "cnc-machinist-downtime-log",
                    `Machinist-entered production downtime · ${value("cnc-machinist-downtime")} min`
                  )}
                </Panel>
              ) : null}
              {workload ? (
                <Panel
                  title="Settings completed by user"
                  subtitle={`${shift} · completed settings and recorded setup time`}
                  action={pin("cnc-settings-by-user")}
                >
                  <People
                    setup
                    items={recordedPeople(
                      workload.approvals.map((row) => ({
                        ...row,
                        at: formatIstDateTime(row.at),
                        minutes: row.waitMinutes,
                      }))
                    )}
                  />
                </Panel>
              ) : null}
              <div className="grid gap-[22px] lg:grid-cols-2">
                {allowed("cnc-setup-duration") ? (
                  <Panel
                    title="Setup time by machine"
                    subtitle="Average recorded setting start to completion"
                    action={pin("cnc-setup-duration")}
                  >
                    <Bars rows={chart("cnc-setup-duration")} unit=" min" />
                  </Panel>
                ) : null}
                {workload ? (
                  <Panel
                    title="Pending setups"
                    subtitle="Requests awaiting setting completion at shift end"
                    action={pin("cnc-setup-queue")}
                  >
                    {workload.pending.length ? (
                      <div className="flex flex-wrap gap-2">
                        {workload.pending.map((row) => (
                          <div
                            key={row.id}
                            className="rounded-lg border bg-[#f7f7f2] px-3 py-2 text-xs dark:bg-muted/60"
                          >
                            <strong className="text-primary">
                              {row.machine} · {row.part}
                            </strong>
                            <br />
                            {row.job} / Setup {row.setup}
                            <br />
                            Received {formatIstDateTime(row.at)} IST
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No setups pending at the cut-off.
                      </p>
                    )}
                  </Panel>
                ) : null}
              </div>
              {allowed("cnc-setup-log") ? (
                <Panel>
                  {tableDetails(
                    "cnc-setup-log",
                    "Setup receipts and completions · supporting job logs"
                  )}
                </Panel>
              ) : null}
            </>
          ) : null}
          {department === "shop-floor" ? (
            <>
              {allowed("cnc-floor-by-user") ? (
                <Panel
                  title="Shop-floor tasks by user"
                  subtitle={`${shift} · recorded material-placement completions`}
                  action={pin("cnc-floor-by-user")}
                >
                  <People
                    items={recordedPeople(
                      (table("cnc-floor-log")?.rows ?? []).map((row) => ({
                        at: String(row[0]),
                        machine: String(row[1]),
                        job: String(row[2]),
                        part: String(row[3]),
                        user: String(row[6] === "—" ? "Unrecorded" : row[6]),
                      }))
                    )}
                  />
                </Panel>
              ) : null}
              {allowed("cnc-floor-log") ? (
                <Panel
                  title="Completed material placements"
                  subtitle={`${shift} · recorded completions`}
                >
                  {tableDetails(
                    "cnc-floor-log",
                    "Material-placement completion log · machines and users"
                  )}
                </Panel>
              ) : null}
              {allowed("cnc-floor-operator-detail") ? (
                <Panel
                  title="Operator-wise efficiency"
                  subtitle="Session output, ERP cycle standard and recorded net runtime"
                >
                  {tableDetails(
                    "cnc-floor-operator-detail",
                    "Operator IDs, machines and efficiency",
                    true
                  )}
                  <ReferenceDetails title="How operator efficiency is calculated">
                    <p className={subheading}>
                      The combined rate is total standard time earned divided by
                      total measured runtime. Completed sessions with a recorded
                      piece cycle standard contribute to the rate.
                    </p>
                  </ReferenceDetails>
                </Panel>
              ) : null}
              {allowed("cnc-dispatch-trend") ? (
                <Panel
                  title="Dispatch trend"
                  subtitle={`Recorded dispatch approvals · ${shift}`}
                  action={pin("cnc-dispatch-trend")}
                >
                  <Counts
                    values={[
                      [
                        value("cnc-dispatch-pieces"),
                        "dispatched pieces · selected dates",
                      ],
                      [
                        value("cnc-dispatch-approvals"),
                        "dispatch approvals · selected dates",
                      ],
                    ]}
                  />
                  <div className="my-4">
                    <Columns
                      groups={chart("cnc-dispatch-trend").map((row) => ({
                        label: formatIstDate(row.label),
                        actual: row.value,
                      }))}
                    />
                  </div>
                  {allowed("cnc-dispatch-log") ? (
                    <ReferenceDetails
                      title="Daily dispatch quantities"
                      pin={pin("cnc-dispatch-daily")}
                    >
                      <ReferenceTable
                        data={table("cnc-dispatch-daily")}
                        label="Daily dispatch quantities"
                        storageKey="cnc-reference-daily-dispatch"
                      />
                      <ReferenceTable
                        data={table("cnc-dispatch-log")}
                        label="Dispatch approval log"
                        storageKey="cnc-reference-dispatch-approvals"
                      />
                    </ReferenceDetails>
                  ) : null}
                </Panel>
              ) : null}
            </>
          ) : null}
          {department === "maintenance" && allowed("cnc-maintenance-work") ? (
            <Panel
              title="Planned maintenance vs completed"
              subtitle="Scheduled jobs and completed work from the maintenance records"
            >
              <Counts
                values={[
                  [value("cnc-maintenance-planned"), "planned jobs"],
                  [value("cnc-maintenance-completed"), "planned completions"],
                  [
                    value("cnc-maintenance-duration"),
                    "average recorded minutes",
                  ],
                ]}
              />
              {tableDetails(
                "cnc-maintenance-work",
                "Selected plans and completed work"
              )}
            </Panel>
          ) : null}
          {department === "planning" && allowed("cnc-planner-priorities")
            ? watchlist
            : null}
        </>
      ) : null}
    </div>
  )
}
