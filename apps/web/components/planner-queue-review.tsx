"use client"

import type { ReactNode } from "react"
import { CircleStop, Undo2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export function PlannerActionDetails({
  reviewing,
  title,
  children,
}: {
  reviewing: boolean
  title: string
  children: ReactNode
}) {
  return (
    <details open={!reviewing} className="min-w-0 rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3 grid gap-3">{children}</div>
    </details>
  )
}

export function PlannerSetupDecision({
  identity,
  machine,
  running,
  selected,
  required = false,
  onChange,
}: {
  identity: string
  machine: string
  running: boolean
  selected: boolean
  required?: boolean
  onChange: (stop: boolean) => void
}) {
  const stopLabel = running ? "Stop running setup" : "Move prepared setup"
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0"
      role="group"
      aria-label={`${identity} on ${machine}`}
    >
      <div className="grid gap-1">
        <div className="text-sm font-medium">
          {machine} · {identity}
        </div>
        <StatusBadge
          value={
            selected
              ? running
                ? "Stop on save"
                : "Move on save"
              : required
                ? running
                  ? "Stop required"
                  : "Move required"
                : running
                  ? "Keep running"
                  : "Keep current setup"
          }
          tone={selected || required ? "warning" : "neutral"}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {selected ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(false)}
          >
            <Undo2 data-icon="inline-start" aria-hidden="true" />
            {running ? "Cancel stop" : "Cancel move"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={selected ? "default" : "outline"}
          aria-pressed={selected}
          aria-label={`${stopLabel}: ${identity} on ${machine}`}
          onClick={() => onChange(true)}
        >
          <CircleStop className="size-4" aria-hidden="true" />
          {stopLabel}
        </Button>
      </div>
    </div>
  )
}

export function PlannerQueuePosition({
  id,
  value,
  options,
  onChange,
}: {
  id: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>Queue position</Label>
      <SearchableSelect id={id} value={value} onValueChange={onChange}>
        <option value="">Before queued work</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SearchableSelect>
    </div>
  )
}

export type PlannerQueueRow = {
  key: string
  identity: string
  kind: "moved" | "running" | "queued" | "stopping"
}

export function PlannerQueueTable({
  machine,
  rows,
  heading = "Queue after this change",
}: {
  machine: string
  rows: ReadonlyArray<PlannerQueueRow>
  heading?: string
}) {
  const ordered = [
    ...rows.filter((row) => row.kind === "running" || row.kind === "stopping"),
    ...rows.filter((row) => row.kind !== "running" && row.kind !== "stopping"),
  ]
  let position = 0
  return (
    <div className="grid min-w-0 gap-2">
      <div className="text-sm font-medium">
        {machine} · {heading}
      </div>
      <OperationalTable
        excelFilters={false}
        aria-label={`${machine} ${heading}`}
        containerClassName="max-h-72 rounded-md border"
        state={rows.length ? "ready" : "empty"}
        stateTitle="Queue is empty"
      >
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Order</TableHead>
            <TableHead>Job / Setup</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map((row) => (
            <TableRow
              key={row.key}
              data-selected={row.kind === "moved" || undefined}
            >
              <TableCell>
                {row.kind === "running"
                  ? "Now"
                  : row.kind === "stopping"
                    ? "—"
                    : ++position}
              </TableCell>
              <TableCell>{row.identity}</TableCell>
              <TableCell>
                <StatusBadge
                  value={
                    row.kind === "moved"
                      ? "Moving here"
                      : row.kind === "running"
                        ? "Running"
                        : row.kind === "stopping"
                          ? "Stop on save"
                          : "Queued"
                  }
                  tone={
                    row.kind === "moved"
                      ? "information"
                      : row.kind === "running"
                        ? "positive"
                        : row.kind === "stopping"
                          ? "warning"
                          : "neutral"
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
