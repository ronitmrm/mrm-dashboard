import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
  SectionCard,
} from "@workspace/ui/components/card"
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
  type CncDashboardCardId,
  type CncDashboardData,
  type CncDashboardFilters,
  type CncQualityApproval,
} from "@/lib/cnc-dashboard"
import type { ProductionFloorCode } from "@workspace/db/production-floors"
import { shiftLabel, unitLabel } from "@/lib/dashboard-units"
import { formatIstDate, formatIstDateTime } from "@/lib/date-time"
import {
  CncDashboardFilterBar,
  CncDashboardHeading,
  cncReferenceFeaturedMetricClass,
  cncReferenceMetricClass,
} from "./cnc-dashboard-cards"
import { PanelBody } from "./cnc-reference-controls"
import { PinDashboardMetricButton } from "./pin-dashboard-metric-button"

const number = new Intl.NumberFormat("en-IN").format
const dayAndMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
})
const section = "rounded-[20px] shadow-none"
const tint = "rounded-xl border bg-[#eef3e5] dark:bg-primary/10"
const summary =
  "flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-primary [&::-webkit-details-marker]:hidden"

function minutes(value: number | null) {
  return value === null ? "—" : value.toFixed(1)
}

function elapsed(from: string, to: string) {
  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.parse(to) - Date.parse(from)) / 60_000)
  )
  return `${Math.floor(elapsedMinutes / 60)}h ${String(elapsedMinutes % 60).padStart(2, "0")}m`
}

function Breakdown({
  rows,
  cause,
}: {
  rows: { label: string; value: number }[]
  cause?: boolean
}) {
  const maximum = Math.max(1, ...rows.map(({ value }) => value))
  return rows.length ? (
    <ul className="grid gap-4">
      {rows.map(({ label, value }) => (
        <li className="grid gap-1.5" key={label}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{label}</span>
            <b className="shrink-0 font-semibold">{number(value)} pcs</b>
          </div>
          <div
            aria-hidden="true"
            className="h-[7px] overflow-hidden rounded-full bg-[#edf1e4] dark:bg-primary/15"
          >
            <div
              className={cn(
                "h-full rounded-full",
                cause ? "bg-[#b8d446]" : "bg-primary"
              )}
              style={{ width: `${(100 * value) / maximum}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      No rejection recorded in this selection.
    </p>
  )
}

export function CncQualityDashboard({
  actions,
  data,
  filters,
  availableIds,
  pinnedIds,
  units,
}: {
  actions: ReactNode
  data: CncDashboardData | null
  filters: CncDashboardFilters
  availableIds: ReadonlySet<CncDashboardCardId>
  pinnedIds: ReadonlySet<string>
  units: readonly ProductionFloorCode[]
}) {
  const shift = `${unitLabel(filters.unit)} · ${
    filters.shift === "all" ? "All shifts" : shiftLabel(filters.shift)
  }`
  const date =
    filters.from === filters.to
      ? dayAndMonth.format(new Date(`${filters.from}T00:00:00Z`))
      : `${formatIstDate(filters.from)} – ${formatIstDate(filters.to)}`
  const workload = data?.qualityWorkload
  const byUser = new Map<string, CncQualityApproval[]>()
  const rejectionTable = data?.tables?.["cnc-rejection-log"]
  const stages = new Map<string, number>()
  for (const approval of workload?.approvals ?? []) {
    const rows = byUser.get(approval.user) ?? []
    rows.push(approval)
    byUser.set(approval.user, rows)
  }
  for (const row of rejectionTable?.rows ?? []) {
    const stage = String(row[4])
    stages.set(stage, (stages.get(stage) ?? 0) + Number(row[5]))
  }
  const approved = workload?.approvals.length ?? 0
  const pending = workload?.pending.length ?? 0
  const matched =
    workload?.approvals.filter(({ waitMinutes }) => waitMinutes !== null)
      .length ?? 0
  const rejected = data?.values["cnc-pieces-rejected"]
  const rejectRate = data?.values["cnc-rejection-rate"]
  const averages = data?.values["cnc-qc-average-wait"]
  const metrics: {
    id: CncDashboardCardId
    value: ReactNode
    foot: string
    unit?: string
  }[] = [
    {
      id: "cnc-qc-requests",
      value: workload?.received,
      foot: `Setting-done requests · ${shift}`,
    },
    {
      id: "cnc-qc-completed",
      value: approved,
      foot: "Saved first-piece approvals",
    },
    {
      id: "cnc-qc-pending",
      value: pending,
      foot: "Includes carry-in requests",
    },
    {
      id: "cnc-pieces-rejected",
      value: number(rejected ?? 0),
      unit: "pcs",
      foot:
        rejectRate == null
          ? "No recorded production"
          : `${rejectRate.toFixed(2)}% of recorded production`,
    },
    {
      id: "cnc-qc-average-wait",
      value: minutes(averages ?? null),
      unit: "min",
      foot: `${matched} matched request / approval pairs`,
    },
  ]
  function pin(id: CncDashboardCardId) {
    return (
      <PinDashboardMetricButton
        cardId={id}
        alreadyPinned={pinnedIds.has(id)}
        title={cncDashboardCards[id][0]}
      />
    )
  }
  const rollup = workload
    ? `${workload.received} requests received · ${approved} approvals given · ${pending} pending at shift end`
    : `${number(data?.sessionCount ?? 0)} production sessions`

  return (
    <div className="grid gap-5">
      <CncDashboardHeading
        actions={actions}
        title={`${date} · ${shift}`}
        description="Quality Control · approval queue, defects and inspector performance"
      />
      <CncDashboardFilterBar
        action="/home/quality"
        filters={filters}
        units={units}
        qualitySummary={`${shift} · ${rollup}`}
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
              <strong className="text-primary">
                Quality Control · {shift}
              </strong>
              <span>{rollup}</span>
            </div>
            {workload ? (
              <span className="text-muted-foreground">
                {formatIstDateTime(workload.endAt)} IST
              </span>
            ) : null}
          </div>
          <section
            aria-label="Quality indicators"
            className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
          >
            {metrics
              .filter(({ id }) => availableIds.has(id))
              .map(({ id, value, foot, unit }, index) => (
                <MetricCard
                  key={id}
                  action={pin(id)}
                  className={cn(
                    cncReferenceMetricClass,
                    index === 0 && cncReferenceFeaturedMetricClass
                  )}
                  description={foot}
                  label={cncDashboardCards[id][0]}
                  tone={index === 0 ? "brand" : "neutral"}
                  unit={unit}
                  value={value ?? "—"}
                />
              ))}
          </section>
          {workload ? (
            <SectionCard className={section}>
              <CardHeader>
                <CardTitle className="text-xl">
                  Approval workload vs completed
                </CardTitle>
                <CardDescription>
                  {shift} · requests enter QC when machinist setting is
                  completed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    tint,
                    "flex flex-wrap gap-x-6 gap-y-2 px-5 py-4"
                  )}
                >
                  {[
                    [workload.carryIn, "carry-in"],
                    [workload.received, "new requests"],
                    [approved, "approved"],
                    [pending, "pending"],
                  ].map(([count, label]) => (
                    <span className="text-xs text-muted-foreground" key={label}>
                      <b className="mr-1.5 text-2xl font-semibold text-primary">
                        {count}
                      </b>
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-start gap-2 border-t border-dotted pt-3">
                  <details className="group min-w-0 flex-1">
                    <summary className={cn(summary, "py-1.5 text-sm")}>
                      Pending approvals ·{" "}
                      {
                        new Set(workload.pending.map(({ machine }) => machine))
                          .size
                      }{" "}
                      machines
                      <ChevronDown
                        className="size-4 shrink-0 group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {workload.pending.map(
                        ({ id, machine, part, job, setup, at }) => (
                          <div
                            key={id}
                            className="rounded-lg border bg-[#f7f7f2] px-3 py-2.5 text-xs leading-relaxed dark:bg-muted/60"
                          >
                            <strong className="text-primary">
                              {machine} · {part}
                            </strong>
                            <p>
                              {job} / Setup {setup}
                            </p>
                            <p>Requested {formatIstDateTime(at)} IST</p>
                            <p>
                              {elapsed(at, workload.endAt)} elapsed at shift end
                            </p>
                          </div>
                        )
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Pending is reconstructed at shift end. Elapsed wait
                      includes breaks and earlier shifts.
                    </p>
                  </details>
                  {pin("cnc-qc-queue")}
                </div>
              </CardContent>
            </SectionCard>
          ) : null}
          {rejectionTable ? (
            <div className="grid gap-[22px] lg:grid-cols-2">
              <SectionCard className={section}>
                <PanelBody
                  action={
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-[var(--color-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning-text)]">
                        {number(rejected ?? 0)} pcs
                      </span>
                      {pin("cnc-rejection-reasons")}
                    </div>
                  }
                  heading={
                    <div>
                      <CardTitle className="text-xl">Defects recorded</CardTitle>
                      <CardDescription>
                        Rejected quantity by defect · {shift}
                      </CardDescription>
                    </div>
                  }
                >
                  <Breakdown
                    rows={data.charts["cnc-rejection-reasons"] ?? []}
                  />
                </PanelBody>
              </SectionCard>
              <SectionCard className={section}>
                <PanelBody
                  action={pin("cnc-rejection-causes")}
                  heading={
                    <div>
                      <CardTitle className="text-xl">
                        Recorded defect causes
                      </CardTitle>
                      <CardDescription>
                        Causes entered against the rejection events
                      </CardDescription>
                    </div>
                  }
                >
                  <Breakdown
                    rows={data.charts["cnc-rejection-causes"] ?? []}
                    cause
                  />
                </PanelBody>
              </SectionCard>
            </div>
          ) : null}
          {workload ? (
            <SectionCard className={section}>
              <PanelBody
                action={
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={cn(tint, "px-2.5 py-1 text-xs text-primary")}
                    >
                      {byUser.size} users
                    </span>
                    {pin("cnc-qc-by-user")}
                  </div>
                }
                heading={
                  <div>
                    <CardTitle className="text-xl">Approvals by user</CardTitle>
                    <CardDescription>
                      {shift} · approval counts and elapsed first-piece approval
                      wait
                    </CardDescription>
                  </div>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[...byUser]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([user, rows]) => {
                      const waits = rows.flatMap(({ waitMinutes }) =>
                        waitMinutes === null ? [] : [waitMinutes]
                      )
                      const average = waits.length
                        ? waits.reduce((total, value) => total + value, 0) /
                          waits.length
                        : null
                      return (
                        <div
                          className="grid gap-3 rounded-2xl border bg-[#f7f7f2] p-4 dark:bg-muted/60"
                          key={user}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e4edd8] text-xs font-semibold text-primary dark:bg-primary/15"
                            >
                              {user
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((word) => word[0])
                                .join("")}
                            </span>
                            <strong className="text-sm font-semibold">
                              {user}
                            </strong>
                          </div>
                          <dl className="grid grid-cols-2 gap-3">
                            <div>
                              <dt className="text-xs text-muted-foreground">
                                Approvals given
                              </dt>
                              <dd className="text-2xl font-semibold text-primary">
                                {rows.length}
                              </dd>
                            </div>
                            <div className="border-l pl-3">
                              <dt className="text-xs text-muted-foreground">
                                Average approval wait
                              </dt>
                              <dd className="text-2xl font-semibold text-primary">
                                {minutes(average)}
                                {average !== null ? (
                                  <small className="ml-1 text-xs">min</small>
                                ) : null}
                              </dd>
                            </div>
                          </dl>
                          <span className="text-xs text-muted-foreground">
                            {waits.length} / {rows.length} request timestamps
                            matched
                          </span>
                          <details className="group">
                            <summary className={cn(summary, "text-xs")}>
                              Machines &amp; approvals{" "}
                              <ChevronDown
                                className="size-3 group-open:rotate-180"
                                aria-hidden="true"
                              />
                            </summary>
                            <ul className="mt-2 grid gap-2 text-xs leading-relaxed">
                              {rows.map(
                                ({
                                  id,
                                  at,
                                  machine,
                                  part,
                                  job,
                                  waitMinutes,
                                }) => (
                                  <li key={`${id}-${at}`}>
                                    <strong>{machine}</strong> · {part} / {job}
                                    <br />
                                    {formatIstDateTime(at)} IST ·{" "}
                                    {waitMinutes === null
                                      ? "Wait unrecorded"
                                      : `${minutes(waitMinutes)} min wait`}
                                  </li>
                                )
                              )}
                            </ul>
                          </details>
                        </div>
                      )
                    })}
                </div>
                {!byUser.size ? (
                  <p className="text-sm text-muted-foreground">
                    No approvals recorded in this selection.
                  </p>
                ) : null}
                <p className="mt-4 text-xs text-muted-foreground">
                  Wait runs from setting done to first-piece approval. Approvals
                  are assigned to their approval shift. Averages include matched
                  records only.
                </p>
              </PanelBody>
            </SectionCard>
          ) : null}
          {rejectionTable ? (
            <SectionCard className={section}>
              <CardContent className="flex items-start gap-2">
                <details className="group min-w-0 flex-1">
                  <summary className={cn(summary, "text-base")}>
                    Rejection stages, machines and parts{" "}
                    <ChevronDown
                      className="size-4 shrink-0 group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  {stages.size ? (
                    <div
                      className={cn(
                        tint,
                        "my-4 flex flex-wrap gap-5 p-4 text-sm"
                      )}
                    >
                      {[...stages].map(([stage, count]) => (
                        <span key={stage}>
                          <strong className="text-primary">
                            {number(count)}
                          </strong>{" "}
                          {stage}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <OperationalTable
                    className="mt-3"
                    containerClassName="max-h-96"
                    aria-label="Rejection stages, machines and parts"
                    filterStorageKey="cnc-quality-rejection-details"
                    state={rejectionTable.rows.length ? "ready" : "empty"}
                    stateTitle="No recorded rejection events"
                  >
                    <TableHeader>
                      <TableRow>
                        {rejectionTable.columns.map((label) => (
                          <TableHead key={label}>{label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rejectionTable.rows.map((row, index) => (
                        <TableRow key={index}>
                          {row.map((value, column) => (
                            <TableCell key={column}>{value}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </OperationalTable>
                </details>
                {pin("cnc-rejection-log")}
              </CardContent>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
