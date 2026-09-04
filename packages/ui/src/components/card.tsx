import * as React from "react"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CircleMinus,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import type { SemanticTone } from "@workspace/ui/lib/semantic-tone"
import { Skeleton } from "@workspace/ui/components/skeleton"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg border border-[var(--color-panel-border)] bg-card py-(--card-spacing) text-sm text-card-foreground shadow-[var(--shadow-sm)] [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t-lg px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base font-semibold tracking-normal text-[var(--color-text-strong)]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-lg px-(--card-spacing) [.border-t]:pt-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

type MetricCardTone = SemanticTone

type MetricCardTrend = "up" | "down" | "flat"

type MetricCardProps = {
  className?: string
  action?: React.ReactNode
  chart?: React.ReactNode
  comparison?: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
  icon?: React.ReactNode
  label: React.ReactNode
  loading?: boolean
  onClick?: () => void
  status?: React.ReactNode
  tone: MetricCardTone
  trend?: MetricCardTrend
  unit?: React.ReactNode
  value: React.ReactNode
}

const metricToneClassNames: Record<
  MetricCardTone,
  { accent: string; icon: string; status: string }
> = {
  accent: {
    accent: "bg-[var(--mrm-tennis)]",
    icon: "bg-[var(--color-accent-tint)] text-[var(--color-on-accent)]",
    status:
      "border-[var(--mrm-tennis)]/35 bg-[var(--color-accent-tint)] text-[var(--color-on-accent)]",
  },
  brand: {
    accent: "bg-primary",
    icon: "bg-[var(--color-brand-tint)] text-primary",
    status: "border-primary/20 bg-[var(--color-brand-tint)] text-primary",
  },
  danger: {
    accent: "bg-[var(--color-danger)]",
    icon: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
    status:
      "border-[var(--color-danger)]/20 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
  },
  inactive: {
    accent: "bg-[var(--color-inactive)]",
    icon: "bg-muted text-muted-foreground",
    status: "border-border bg-muted text-muted-foreground",
  },
  information: {
    accent: "bg-[var(--color-info)]",
    icon: "bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
    status:
      "border-[var(--color-info)]/20 bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  },
  neutral: {
    accent: "bg-border",
    icon: "bg-muted text-muted-foreground",
    status: "border-border bg-muted text-muted-foreground",
  },
  positive: {
    accent: "bg-[var(--color-positive)]",
    icon: "bg-[var(--color-positive-bg)] text-[var(--color-positive-text)]",
    status:
      "border-[var(--color-positive)]/20 bg-[var(--color-positive-bg)] text-[var(--color-positive-text)]",
  },
  warning: {
    accent: "bg-[var(--color-warning)]",
    icon: "bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
    status:
      "border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  },
}

const metricToneSurfaceClassNames: Record<MetricCardTone, string> = {
  accent: "bg-[color-mix(in_srgb,var(--mrm-tennis)_10%,var(--color-surface))]",
  brand: "bg-[color-mix(in_srgb,var(--mrm-green)_7%,var(--color-surface))]",
  danger: "bg-[color-mix(in_srgb,var(--color-danger)_7%,var(--color-surface))]",
  inactive: "bg-muted/45",
  information:
    "bg-[color-mix(in_srgb,var(--color-info)_8%,var(--color-surface))]",
  neutral: "bg-card",
  positive:
    "bg-[color-mix(in_srgb,var(--color-positive)_8%,var(--color-surface))]",
  warning:
    "bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))]",
}
type SectionCardProps = React.ComponentProps<typeof Card> & {
  tone?: SemanticTone
}

const sectionToneClassNames: Record<SemanticTone, string> = {
  accent: "border-[var(--mrm-tennis)]/35 bg-[var(--color-accent-tint)]",
  brand: "border-primary/25 bg-[var(--color-brand-tint)]",
  danger: "border-[var(--color-danger)]/25 bg-[var(--color-danger-bg)]",
  inactive: "border-border bg-muted/45",
  information: "border-[var(--color-info)]/25 bg-[var(--color-info-bg)]",
  neutral: "bg-card",
  positive: "border-[var(--color-positive)]/25 bg-[var(--color-positive-bg)]",
  warning: "border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)]",
}

function SectionCard({
  className,
  tone = "neutral",
  ...props
}: SectionCardProps) {
  return (
    <Card
      className={cn(sectionToneClassNames[tone], className)}
      data-slot="section-card"
      data-tone={tone}
      {...props}
    />
  )
}

function MetricCard({
  chart,
  action,
  className,
  comparison,
  description,
  error,
  icon,
  label,
  loading = false,
  onClick,
  status,
  tone = "neutral",
  trend,
  unit,
  value,
}: MetricCardProps) {
  const toneClassNames = metricToneClassNames[tone]
  const TrendIcon =
    trend === "up"
      ? ArrowUpRight
      : trend === "down"
        ? ArrowDownRight
        : CircleMinus
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn("absolute inset-x-0 top-0 h-0.5", toneClassNames.accent)}
      />
      {loading ? (
        <div
          aria-label={`Loading ${String(label)}`}
          className="grid w-full gap-3"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-8 w-2/3" />
            </div>
            <Skeleton className="size-9 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : error ? (
        <div
          className="flex min-w-0 items-start gap-3 text-[var(--color-error-text)]"
          role="alert"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-error-bg)]">
            <AlertTriangle aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-[0.08em] uppercase">
              {label}
            </div>
            <div className="mt-1 text-sm">{error}</div>
          </div>
        </div>
      ) : (
        <div className="grid w-full gap-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {label}
              </div>
              <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-heading text-2xl font-semibold tracking-tight text-[var(--color-text-strong)] tabular-nums">
                  {value}
                </span>
                {unit ? (
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {unit}
                  </span>
                ) : null}
              </div>
            </div>
            {action || icon ? (
              <div className="flex shrink-0 items-start gap-1">
                {action ? (
                  <div data-slot="metric-card-action">{action}</div>
                ) : null}
                {icon ? (
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                      toneClassNames.icon
                    )}
                  >
                    {icon}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {description ? (
            <div className="line-clamp-2 text-xs text-muted-foreground">
              {description}
            </div>
          ) : null}
          {comparison || status ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {comparison ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                    toneClassNames.status
                  )}
                >
                  {trend ? (
                    <TrendIcon aria-hidden="true" className="size-3" />
                  ) : null}
                  {comparison}
                </span>
              ) : null}
              {status ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 font-medium",
                    toneClassNames.status
                  )}
                >
                  {status}
                </span>
              ) : null}
            </div>
          ) : null}
          {chart ? <div className="mt-auto min-h-7">{chart}</div> : null}
        </div>
      )}
      {onClick && !loading && !error ? (
        <ArrowRight
          aria-hidden="true"
          className="absolute right-3 bottom-3 size-3.5 text-muted-foreground opacity-0 transition-[opacity,transform] group-hover/metric:translate-x-0.5 group-hover/metric:opacity-100 group-focus-visible/metric:opacity-100"
        />
      ) : null}
    </>
  )
  const metricClassName = cn(
    "group/metric relative flex min-h-28 items-stretch overflow-hidden rounded-lg border border-[var(--color-panel-border)] p-4 text-left shadow-[var(--shadow-sm)]",
    metricToneSurfaceClassNames[tone],
    onClick &&
      "pr-8 transition-[border-color,box-shadow,background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:border-primary/35 hover:bg-[var(--color-brand-tint)] hover:shadow-[var(--shadow-md)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
    className
  )

  return onClick ? (
    <button
      className={metricClassName}
      data-slot="metric-card"
      data-tone={tone}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  ) : (
    <div className={metricClassName} data-slot="metric-card" data-tone={tone}>
      {content}
    </div>
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  SectionCard,
  CardContent,
  MetricCard,
  type SectionCardProps,
  type SemanticTone,
  type MetricCardProps,
  type MetricCardTone,
  type MetricCardTrend,
}
