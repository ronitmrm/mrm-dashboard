import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

// Phone stand-in for a wide register row: the key details as a card.
// Tapping the card opens the row's full details; the action stays separate.

function RecordCardList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="record-card-list"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

type RecordCardField = { label: string; value: React.ReactNode }

function RecordCard({
  title,
  badges,
  description,
  fields,
  action,
  onSelect,
  tone = "default",
}: {
  title: React.ReactNode
  badges?: React.ReactNode
  description?: React.ReactNode
  fields: readonly RecordCardField[]
  action?: React.ReactNode
  onSelect?: () => void
  tone?: "default" | "warning"
}) {
  const content = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-base font-semibold">{title}</span>
        {badges}
      </div>
      {description ? (
        <div className="mt-0.5 text-sm text-muted-foreground">
          {description}
        </div>
      ) : null}
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
        {fields.map(({ label, value }) => (
          <div className="min-w-0" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium break-words tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
  return (
    <li
      data-slot="record-card"
      data-tone={tone}
      className="rounded-lg border border-[var(--color-panel-border)] bg-card data-[tone=warning]:bg-[var(--color-warning-bg)]"
    >
      {onSelect ? (
        <button
          type="button"
          className="block w-full rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={onSelect}
        >
          {content}
        </button>
      ) : (
        <div className="p-3">{content}</div>
      )}
      {action ? (
        <div className="flex flex-wrap gap-2 px-3 pb-3 [&>button]:flex-1">
          {action}
        </div>
      ) : null}
    </li>
  )
}

export { RecordCard, RecordCardList, type RecordCardField }
