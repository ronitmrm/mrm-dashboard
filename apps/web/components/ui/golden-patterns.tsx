import type { ComponentProps, ComponentType, ReactNode } from "react"
import type { LucideProps } from "lucide-react"

import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricCard,
  SectionCard,
} from "@workspace/ui/components/card"
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"

import {
  StandardState,
  type StandardStateVariant,
} from "@workspace/ui/components/standard-state"
type PatternIcon = ComponentType<LucideProps>

const summaryNumberFormat = new Intl.NumberFormat("en-IN")

function MetricSummary({
  items,
  scope,
  className,
}: {
  items: readonly Pick<
    ComponentProps<typeof MetricCard>,
    "label" | "value" | "description" | "tone"
  >[]
  scope: string
  className?: string
}) {
  return (
    <section
      aria-label={scope}
      className={cn("grid min-w-0 shrink-0 gap-2", className)}
      data-slot="metric-summary"
    >
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        {items.map((item) => (
          <MetricCard
            {...item}
            className="min-w-0 p-3"
            key={String(item.label)}
            value={
              typeof item.value === "number"
                ? summaryNumberFormat.format(item.value)
                : item.value
            }
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{scope}</p>
    </section>
  )
}

function PageHeader({
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
  description?: ReactNode
  icon?: PatternIcon
  title: ReactNode
}) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-xl border border-[var(--color-panel-border)] bg-[color-mix(in_srgb,var(--mrm-green)_5%,var(--color-surface))] p-4 shadow-[var(--shadow-sm)] sm:p-5",
        className
      )}
      data-slot="page-header"
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-sm)]">
            <Icon aria-hidden="true" className="size-5" />
          </span>
        ) : null}
        <div className="grid min-w-0 gap-1">
          {badge ? <div className="mb-1 w-fit">{badge}</div> : null}
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-pretty">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <ActionToolbar>{actions}</ActionToolbar> : null}
    </header>
  )
}

function ActionToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-label="Page actions"
      className={cn(
        "flex min-h-9 shrink-0 flex-wrap items-center justify-end gap-2",
        className
      )}
      data-slot="action-toolbar"
      role="toolbar"
      {...props}
    />
  )
}

function FormSection({
  children,
  className,
  description,
  title,
}: {
  children: ReactNode
  className?: string
  description?: ReactNode
  title: ReactNode
}) {
  return (
    <SectionCard className={className} data-slot="form-section" size="sm">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </SectionCard>
  )
}

function FormGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 [&_[data-slot=field]]:gap-1.5",
        className
      )}
      data-slot="form-grid"
      {...props}
    />
  )
}

function StandardDialogContent({
  children,
  description,
  title,
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  description?: ReactNode
  title: ReactNode
}) {
  return (
    <DialogContent {...props}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      {children}
    </DialogContent>
  )
}

function StandardDrawerContent({
  children,
  description,
  title,
  ...props
}: React.ComponentProps<typeof SheetContent> & {
  description?: ReactNode
  title: ReactNode
}) {
  return (
    <SheetContent {...props}>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        {description ? (
          <SheetDescription>{description}</SheetDescription>
        ) : null}
      </SheetHeader>
      {children}
    </SheetContent>
  )
}

export {
  ActionToolbar,
  FormGrid,
  FormSection,
  MetricSummary,
  PageHeader,
  StandardDialogContent,
  StandardDrawerContent,
  StandardState,
  type StandardStateVariant,
}
