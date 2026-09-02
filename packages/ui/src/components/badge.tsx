import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"
import type { SemanticTone } from "@workspace/ui/lib/semantic-tone"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-[var(--color-error-bg)] text-[var(--color-error-text)] focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:bg-destructive/20 dark:text-destructive dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

const statusToneClassNames: Record<SemanticTone, string> = {
  accent:
    "border-[var(--mrm-tennis)]/35 bg-[var(--color-accent-tint)] text-[var(--color-on-accent)]",
  brand: "border-primary/25 bg-[var(--color-brand-tint)] text-primary",
  danger:
    "border-[var(--color-danger)]/25 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
  inactive: "border-border bg-muted text-muted-foreground",
  information:
    "border-[var(--color-info)]/25 bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  neutral: "border-border bg-card text-foreground",
  positive:
    "border-[var(--color-positive)]/25 bg-[var(--color-positive-bg)] text-[var(--color-positive-text)]",
  warning:
    "border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
}

type StatusBadgeProps = Omit<
  React.ComponentProps<typeof Badge>,
  "children" | "variant"
> & {
  children?: React.ReactNode
  tone?: SemanticTone
  value?: unknown
}

function statusLabel(value: unknown) {
  return String(value ?? "").trim() || "-"
}

function statusToneForValue(value: unknown): SemanticTone {
  const normalized = statusLabel(value).toLowerCase()

  if (
    normalized === "-" ||
    normalized.includes("inactive") ||
    normalized.includes("archived") ||
    normalized.includes("unavailable") ||
    normalized.includes("not running")
  ) {
    return "inactive"
  }
  if (
    normalized === "not ok" ||
    normalized === "ng" ||
    normalized.includes("rejected") ||
    normalized.includes("resigned") ||
    normalized.includes("delayed") ||
    normalized.includes("overdue") ||
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("need") ||
    normalized.includes("action") ||
    normalized.includes("missing") ||
    normalized.includes("required") ||
    normalized.includes("breakdown")
  ) {
    return "danger"
  }
  if (
    normalized.includes("waiting") ||
    normalized.includes("pending") ||
    normalized.includes("shifted") ||
    normalized.includes("attention") ||
    normalized.includes("due")
  ) {
    return "warning"
  }
  if (
    normalized.includes("in production") ||
    normalized.includes("running") ||
    normalized.includes("early") ||
    normalized.includes("scheduled") ||
    normalized.includes("interview") ||
    normalized.includes("selected")
  ) {
    return "information"
  }
  if (
    normalized === "ok" ||
    normalized.includes("open") ||
    normalized.includes("vacant") ||
    normalized.includes("occupied") ||
    normalized.includes("approved") ||
    normalized.includes("appointed") ||
    normalized.includes("ready") ||
    normalized.includes("received") ||
    normalized.includes("dispatch") ||
    normalized.includes("setup complete") ||
    normalized.includes("on time") ||
    normalized.includes("complete") ||
    normalized === "active"
  ) {
    return "positive"
  }
  return "neutral"
}

function StatusBadge({
  children,
  className,
  tone,
  value,
  ...props
}: StatusBadgeProps) {
  const content = children ?? statusLabel(value)
  const resolvedTone = tone ?? statusToneForValue(content)

  return (
    <Badge
      className={cn(statusToneClassNames[resolvedTone], className)}
      data-slot="status-badge"
      data-tone={resolvedTone}
      variant="outline"
      {...props}
    >
      {content}
    </Badge>
  )
}

export {
  Badge,
  StatusBadge,
  badgeVariants,
  statusToneForValue,
  type StatusBadgeProps,
}
