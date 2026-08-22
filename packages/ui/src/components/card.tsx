import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

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
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg border border-border bg-card py-(--card-spacing) text-sm text-card-foreground shadow-[var(--shadow-sm)] [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
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

function MetricCard({
  className,
  description,
  icon,
  label,
  onClick,
  value,
}: {
  className?: string
  description?: React.ReactNode
  icon?: React.ReactNode
  label: React.ReactNode
  onClick?: () => void
  value: React.ReactNode
}) {
  const content = (
    <>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </div>
        <div className="text-base font-semibold tabular-nums">{value}</div>
        {description ? (
          <div className="truncate text-[10px] text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {icon ? <div className="shrink-0 text-primary">{icon}</div> : null}
    </>
  )
  const metricClassName = cn(
    "flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-[var(--shadow-sm)]",
    onClick &&
      "transition-[border-color,box-shadow,background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:border-primary/50 hover:bg-muted/40 hover:shadow-[var(--shadow-md)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
    className
  )

  return onClick ? (
    <button
      className={metricClassName}
      data-slot="metric-card"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  ) : (
    <div className={metricClassName} data-slot="metric-card">
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
  CardContent,
  MetricCard,
}
