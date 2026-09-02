import type { ComponentType, ReactNode } from "react"
import {
  AlertTriangle,
  Inbox,
  LoaderCircle,
  type LucideProps,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

type StandardStateVariant = "empty" | "loading" | "error"

type StandardStateProps = {
  action?: ReactNode
  className?: string
  icon?: ComponentType<LucideProps>
  description: ReactNode
  title: ReactNode
  variant?: StandardStateVariant
}

function StandardState({
  action,
  className,
  icon,
  description,
  title,
  variant = "empty",
}: StandardStateProps) {
  const Icon =
    icon ??
    (variant === "error"
      ? AlertTriangle
      : variant === "loading"
        ? LoaderCircle
        : Inbox)

  return (
    <div
      aria-live={variant === "loading" ? "polite" : undefined}
      className={cn(
        "grid min-h-36 place-items-center rounded-lg border border-dashed border-[var(--color-panel-border)] bg-muted/20 p-6 text-center",
        variant === "error" &&
          "border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)]",
        className
      )}
      data-slot="standard-state"
      data-state={variant}
      data-variant={variant}
      role={
        variant === "error"
          ? "alert"
          : variant === "loading"
            ? "status"
            : undefined
      }
    >
      <div className="grid max-w-md justify-items-center gap-2">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground",
            variant === "error" &&
              "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
          )}
        >
          <Icon
            aria-hidden="true"
            className={cn("size-5", variant === "loading" && "animate-spin")}
          />
        </span>
        <p className="font-heading text-base font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}

export { StandardState, type StandardStateProps, type StandardStateVariant }
