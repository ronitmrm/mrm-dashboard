import type { ComponentType, ReactNode } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleCheckBig,
  CircleMinus,
  Info,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type DashboardTone =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "info"

type DashboardIcon = ComponentType<{ className?: string }>

const toneStyles: Record<DashboardTone, string> = {
  accent:
    "border-[var(--mrm-tennis)]/35 bg-[color-mix(in_srgb,var(--mrm-tennis)_10%,var(--color-surface))] text-[var(--color-on-accent)]",
  brand:
    "border-primary/20 bg-[color-mix(in_srgb,var(--mrm-green)_7%,var(--color-surface))] text-primary",
  error:
    "border-[var(--color-error)]/20 bg-[var(--color-error-bg)] text-[var(--color-error-text)]",
  info: "border-[var(--color-info)]/20 bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  neutral: "border-border bg-muted/45 text-foreground",
  success:
    "border-[var(--color-success)]/20 bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  warning:
    "border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
}

function DashboardPageHeader({
  actions,
  badge,
  className,
  description,
  icon: Icon,
  title,
}: {
  actions?: ReactNode
  badge?: ReactNode
  className?: string
  description: ReactNode
  icon?: DashboardIcon
  title: ReactNode
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-xl border border-[var(--color-panel-border)] bg-[color-mix(in_srgb,var(--mrm-green)_5%,var(--color-surface))] p-4 shadow-[var(--shadow-sm)] sm:p-5",
        className
      )}
      data-slot="dashboard-page-header"
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-sm)]">
            <Icon aria-hidden="true" className="size-5" />
          </span>
        ) : null}
        <div className="grid min-w-0 gap-1">
          {badge ? <div className="mb-1 w-fit">{badge}</div> : null}
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-pretty">
            {title}
          </h2>
          <p className="max-w-3xl text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </section>
  )
}

function DashboardSection({
  actions,
  children,
  className,
  description,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
  description?: ReactNode
  title?: ReactNode
}) {
  return (
    <section
      className={cn("grid min-w-0 gap-3", className)}
      data-slot="dashboard-section"
    >
      {title || description || actions ? (
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="font-heading text-lg font-semibold tracking-tight text-pretty">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-0.5 max-w-3xl text-sm text-pretty text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function DashboardGrid({
  children,
  className,
  columns = "four",
}: {
  children: ReactNode
  className?: string
  columns?: "two" | "three" | "four" | "five" | "six"
}) {
  const columnsClassName = {
    five: "sm:grid-cols-2 xl:grid-cols-5",
    four: "sm:grid-cols-2 xl:grid-cols-4",
    six: "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6",
    three: "sm:grid-cols-2 xl:grid-cols-3",
    two: "xl:grid-cols-2",
  }[columns]

  return (
    <div
      className={cn("grid min-w-0 gap-4", columnsClassName, className)}
      data-slot="dashboard-grid"
    >
      {children}
    </div>
  )
}

function ComparisonCard(
  props: React.ComponentProps<typeof MetricCard> & {
    change: ReactNode
    trend?: "up" | "down" | "flat"
  }
) {
  return <MetricCard {...props} comparison={props.change} trend={props.trend} />
}

function TrendCard(
  props: React.ComponentProps<typeof MetricCard> & {
    chart?: ReactNode
    trend?: "up" | "down" | "flat"
  }
) {
  return <MetricCard {...props} chart={props.chart} trend={props.trend} />
}

function ChartCard({
  actions,
  children,
  className,
  description,
  empty = false,
  emptyDescription = "Data will appear when records are available.",
  emptyTitle = "No Data Available",
  error,
  icon: Icon = BarChart3,
  legend,
  loading = false,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
  description?: ReactNode
  empty?: boolean
  emptyDescription?: ReactNode
  emptyTitle?: ReactNode
  error?: ReactNode
  icon?: DashboardIcon
  legend?: ReactNode
  loading?: boolean
  title: ReactNode
}) {
  return (
    <Card className={cn("h-full", className)} data-slot="chart-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              {description ? (
                <CardDescription>{description}</CardDescription>
              ) : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="grid min-h-56 gap-4 pt-1">
        {loading ? (
          <DashboardLoadingSkeleton cards={0} chartRows={5} />
        ) : error ? (
          <DashboardErrorState description={error} title="Chart Unavailable" />
        ) : empty ? (
          <DashboardEmptyState
            description={emptyDescription}
            icon={BarChart3}
            title={emptyTitle}
          />
        ) : (
          children
        )}
        {legend && !loading && !error && !empty ? (
          <div className="border-t pt-3 text-xs text-muted-foreground">
            {legend}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DashboardBarChart({
  formatValue = (value) => new Intl.NumberFormat("en-IN").format(value),
  rows,
}: {
  formatValue?: (value: number) => ReactNode
  rows: Array<{ label: string; value: number }>
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.value))

  return (
    <div className="grid content-start gap-4" data-slot="dashboard-bar-chart">
      {rows.map((row) => {
        const percentage = Math.max(2, (row.value / maximum) * 100)
        return (
          <div className="grid gap-1.5" key={row.label}>
            <div className="flex min-w-0 justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatValue(row.value)}
              </span>
            </div>
            <div
              aria-label={`${row.label}: ${row.value}`}
              aria-valuemax={maximum}
              aria-valuemin={0}
              aria-valuenow={row.value}
              className="h-2.5 overflow-hidden rounded-full bg-primary/10"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-[var(--dur-base)] ease-[var(--ease-standard)]"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProgressCard({
  description,
  label,
  maximum = 100,
  tone = "brand",
  value,
}: {
  description?: ReactNode
  label: ReactNode
  maximum?: number
  tone?: DashboardTone
  value: number
}) {
  const percentage = Math.min(
    100,
    Math.max(0, (value / Math.max(1, maximum)) * 100)
  )
  return (
    <Card className="h-full" data-slot="progress-card">
      <CardContent className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{label}</p>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <span className="font-semibold tabular-nums">{value}</span>
        </div>
        <div
          aria-label={`${String(label)}: ${value} of ${maximum}`}
          aria-valuemax={maximum}
          aria-valuemin={0}
          aria-valuenow={value}
          className="h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className={cn("h-full rounded-full", toneStyles[tone])}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

type StatusSummaryItem = {
  href?: string
  label: ReactNode
  tone?: DashboardTone
  value: ReactNode
}

function StatusSummary({
  items,
  title,
}: {
  items: StatusSummaryItem[]
  title?: ReactNode
}) {
  return (
    <div className="grid gap-3" data-slot="status-summary">
      {title ? <h4 className="font-semibold">{title}</h4> : null}
      {items.map((item, index) => {
        const content = (
          <>
            <span className="min-w-0 font-medium">{item.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge
                className={toneStyles[item.tone ?? "neutral"]}
                variant="outline"
              >
                {item.value}
              </Badge>
              {item.href ? (
                <ArrowRight aria-hidden="true" className="size-4" />
              ) : null}
            </span>
          </>
        )
        const className = cn(
          "flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 py-3",
          item.href &&
            "transition-[border-color,background-color] duration-[var(--dur-fast)] hover:border-primary/35 hover:bg-primary/5"
        )
        return item.href ? (
          <Link
            className={className}
            href={item.href}
            key={`${String(item.label)}-${index}`}
          >
            {content}
          </Link>
        ) : (
          <div className={className} key={`${String(item.label)}-${index}`}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

function ActivityList({
  items,
}: {
  items: Array<{
    description?: ReactNode
    href?: string
    icon?: DashboardIcon
    label: ReactNode
    meta?: ReactNode
  }>
}) {
  return (
    <div
      className="divide-y overflow-hidden rounded-lg border border-[var(--color-panel-border)]"
      data-slot="activity-list"
    >
      {items.map((item, index) => {
        const Icon = item.icon
        const content = (
          <>
            {Icon ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon aria-hidden="true" className="size-4" />
              </span>
            ) : null}
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{item.label}</span>
              {item.description ? (
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </span>
            {item.meta ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {item.meta}
              </span>
            ) : null}
          </>
        )
        const className =
          "flex min-w-0 items-center gap-3 bg-card px-4 py-3 text-left hover:bg-muted/45"
        return item.href ? (
          <Link className={className} href={item.href} key={index}>
            {content}
          </Link>
        ) : (
          <div className={className} key={index}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

function DataTableCard({
  actions,
  children,
  className,
  contentClassName,
  description,
  error,
  icon: Icon,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  description?: ReactNode
  error?: ReactNode
  icon?: DashboardIcon
  title: ReactNode
}) {
  return (
    <Card className={cn("min-w-0", className)} data-slot="data-table-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon aria-hidden="true" className="size-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              {description ? (
                <CardDescription>{description}</CardDescription>
              ) : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("min-w-0 pt-1", contentClassName)}>
        {error ? (
          <DashboardErrorState description={error} title="Table Unavailable" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function FilterBar({
  children,
  className,
  label = "Dashboard Filters",
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-[var(--color-panel-border)] bg-card p-3 shadow-[var(--shadow-sm)]",
        className
      )}
      data-slot="dashboard-filter-bar"
    >
      {children}
    </section>
  )
}

function DateRangeSelector({
  children,
  label = "Date Range",
}: {
  children: ReactNode
  label?: string
}) {
  return (
    <div className="grid gap-1.5" data-slot="date-range-selector">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function DashboardEmptyState({
  action,
  description,
  icon: Icon = Info,
  title,
}: {
  action?: ReactNode
  description: ReactNode
  icon?: DashboardIcon
  title: ReactNode
}) {
  return (
    <Empty
      className="min-h-48 bg-muted/20 p-8"
      data-slot="dashboard-empty-state"
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

function DashboardLoadingSkeleton({
  cards = 4,
  chartRows = 0,
}: {
  cards?: number
  chartRows?: number
}) {
  if (chartRows > 0) {
    return (
      <div
        aria-label="Loading dashboard chart"
        className="grid gap-4"
        role="status"
      >
        {Array.from({ length: chartRows }).map((_, index) => (
          <div className="grid gap-2" key={index}>
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div aria-label="Loading dashboard" className="grid gap-4" role="status">
      <DashboardGrid>
        {Array.from({ length: cards }).map((_, index) => (
          <Skeleton className="h-28 rounded-lg" key={index} />
        ))}
      </DashboardGrid>
      <Skeleton className="h-80 rounded-lg" />
      <DashboardGrid columns="two">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </DashboardGrid>
    </div>
  )
}

function DashboardErrorState({
  action,
  description,
  title,
}: {
  action?: ReactNode
  description: ReactNode
  title: ReactNode
}) {
  return (
    <div
      className="grid min-h-40 place-items-center rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error-bg)] p-6 text-center"
      data-slot="dashboard-error-state"
      role="alert"
    >
      <div className="grid max-w-md justify-items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-error)]/10 text-[var(--color-error-text)]">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <p className="font-heading text-base font-semibold text-[var(--color-error-text)]">
          {title}
        </p>
        <p className="text-sm text-[var(--color-error-text)]/85">
          {description}
        </p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}

function TrendIndicator({
  direction,
  label,
}: {
  direction: "up" | "down" | "flat"
  label: ReactNode
}) {
  const Icon =
    direction === "up"
      ? ArrowUpRight
      : direction === "down"
        ? ArrowDownRight
        : CircleMinus
  const tone =
    direction === "up" ? "success" : direction === "down" ? "error" : "neutral"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneStyles[tone]
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </span>
  )
}

function StatusIcon({ tone }: { tone: DashboardTone }) {
  const Icon =
    tone === "success"
      ? CircleCheckBig
      : tone === "warning" || tone === "error"
        ? AlertTriangle
        : Info
  return <Icon aria-hidden="true" className="size-4" />
}

export {
  ActivityList,
  ChartCard,
  ComparisonCard,
  DashboardBarChart,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardGrid,
  DashboardLoadingSkeleton,
  DashboardPageHeader,
  DashboardSection,
  DataTableCard,
  DateRangeSelector,
  FilterBar,
  ProgressCard,
  StatusIcon,
  StatusSummary,
  TrendCard,
  TrendIndicator,
  type DashboardTone,
  type StatusSummaryItem,
}
