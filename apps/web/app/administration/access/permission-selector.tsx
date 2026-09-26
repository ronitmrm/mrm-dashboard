"use client"

import { ChevronDown, ImageIcon, Info, Search, X } from "lucide-react"
import Image from "next/image"
import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import {
  type PermissionAccessLevel,
  type PermissionAccessAction,
  type PermissionAccessRow,
  type PermissionOption,
  configuredPermissionCount,
  normalizePermissionKeys,
  permissionAccessLevelForKeys,
  permissionAccessPageLabels,
  permissionAccessRows,
  permissionAccessSummary,
  permissionKeysForActionToggle,
  permissionKeysForPreset,
} from "./permission-access"
import { permissionPreview, permissionRowPreview } from "./permission-preview"
import {
  apiOnlyPermissionKeys,
  nonVisualPermissionKeys,
} from "../../../lib/auth/page-access-catalog"

export function PermissionSelector({
  initialPermissionKeys = [],
  permissions,
}: {
  initialPermissionKeys?: readonly string[]
  permissions: readonly PermissionOption[]
}) {
  const [query, setQuery] = useState("")
  const rows = useMemo(
    () =>
      permissionAccessRows(permissions).map((row) => ({
        ...row,
        pages: permissionAccessPageLabels(row),
      })),
    [permissions]
  )
  const [permissionKeys, setPermissionKeys] = useState<string[]>(() => {
    const assignable = new Set(rows.flatMap((row) => row.fullPermissionKeys))
    return initialPermissionKeys.filter((key) => assignable.has(key)).sort()
  })
  const normalizedQuery = query.trim().toLowerCase()
  const retainedPermissionKeys = initialPermissionKeys.filter((key) =>
    nonVisualPermissionKeys.has(key)
  )
  const visibleRows = rows.filter(
    (row) =>
      !normalizedQuery ||
      row.module.toLowerCase().includes(normalizedQuery) ||
      row.submodule.toLowerCase().includes(normalizedQuery) ||
      row.pages.some((page) => page.toLowerCase().includes(normalizedQuery)) ||
      row.label.toLowerCase().includes(normalizedQuery) ||
      row.fullPermissionKeys.some((key) =>
        key.toLowerCase().includes(normalizedQuery)
      )
  )
  const selectedPermissionKeys = normalizePermissionKeys([
    ...permissionKeys,
    ...retainedPermissionKeys,
  ])
  const configuredCount = configuredPermissionCount(rows, permissionKeys)

  function setAccess(id: string, level: PermissionAccessLevel) {
    const row = rows.find((candidate) => candidate.id === id)
    if (!row) return
    setPermissionKeys((current) => permissionKeysForPreset(row, current, level))
  }

  function toggleAction(
    row: (typeof rows)[number],
    action: (typeof row.actions)[number]
  ) {
    setPermissionKeys((current) =>
      permissionKeysForActionToggle(row, current, action)
    )
  }

  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={0}>
      <FieldSet className="min-w-0 gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <FieldLegend>Capabilities</FieldLegend>
            <FieldDescription>
              Page access controls opening a screen. Task access controls
              actions such as Save or Delete. Custom selects individual actions
              when more than one is available. Modifying actions keep View
              selected when available. Existing permissions without a current
              screen stay on the role when you save.
            </FieldDescription>
          </div>
          <Badge variant="secondary">{configuredCount} configured</Badge>
        </div>

        {selectedPermissionKeys.map((key) => (
          <input key={key} name="permissionKeys" type="hidden" value={key} />
        ))}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search capabilities"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search capabilities, for example Design or Store"
              value={query}
            />
          </div>
          {query ? (
            <Button
              onClick={() => setQuery("")}
              type="button"
              variant="outline"
            >
              <X /> Clear
            </Button>
          ) : null}
        </div>

        <div className="min-w-0 rounded-lg border">
          <OperationalTable
            className="min-w-[60rem] table-fixed"
            containerClassName="max-h-[min(34rem,calc(100svh-16rem))]"
            filterStorageKey="access-administration-permissions"
          >
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[15%]">Module</TableHead>
                <TableHead className="w-[17%]">Area</TableHead>
                <TableHead className="w-[20%]">Screen</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead className="sticky right-0 w-48 bg-muted">
                  Access
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="wrap-anywhere whitespace-normal text-muted-foreground capitalize">
                      {row.module}
                    </TableCell>
                    <TableCell className="wrap-anywhere whitespace-normal">
                      {row.submodule}
                    </TableCell>
                    <TableCell
                      className="wrap-anywhere whitespace-normal"
                      data-filter-values={JSON.stringify(row.pages)}
                    >
                      {row.pages.join(" / ")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.kind === "page" ? "default" : "outline"}
                      >
                        {row.kind === "page" ? "Screen" : "Action"}
                      </Badge>
                    </TableCell>
                    <TableCell className="wrap-anywhere whitespace-normal">
                      <PermissionPreviewLabel
                        label={row.label}
                        location={`${row.module} / ${row.submodule}`}
                        noScreen={row.fullPermissionKeys.every((key) =>
                          apiOnlyPermissionKeys.has(key)
                        )}
                        preview={permissionRowPreview(row)}
                      />
                    </TableCell>
                    <TableCell className="sticky right-0 bg-card">
                      <AccessChip
                        onActionToggle={(action) => toggleAction(row, action)}
                        onPresetChange={(level) => setAccess(row.id, level)}
                        permissionKeys={permissionKeys}
                        row={row}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No Pages Or Tasks Match This Search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </OperationalTable>
        </div>
      </FieldSet>
    </TooltipProvider>
  )
}

function PermissionPreviewLabel({
  label,
  location,
  noScreen = false,
  onClick,
  preview,
}: {
  label: string
  location: string
  noScreen?: boolean
  onClick?: () => void
  preview: ReturnType<typeof permissionPreview>
}) {
  if (!preview) {
    if (!noScreen) return <span className="font-medium">{label}</span>
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`${label}: no in-app screen`}
            className="inline-flex cursor-help items-center gap-1.5 text-left font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={onClick}
            type="button"
          >
            {label}
            <Info
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-xs rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-xl"
          side="left"
        >
          This permission protects a server action. The app has no screen or
          button to show for it.
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={
            onClick ? `Toggle ${label}; hover for preview` : `Preview ${label}`
          }
          className="inline-flex cursor-help items-center gap-1.5 text-left font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={onClick}
          type="button"
        >
          {label}
          <ImageIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent
        className="w-[min(52rem,calc(100vw-2rem))] max-w-none flex-col items-stretch gap-2 rounded-lg border bg-card p-2 text-card-foreground shadow-xl"
        side="left"
        sideOffset={8}
      >
        <Image
          alt={`${label} in ${location}`}
          className="mx-auto h-auto max-h-[min(70vh,40rem)] w-auto max-w-full rounded-md border object-contain object-top"
          height={900}
          src={preview.src}
          unoptimized
          width={1136}
        />
        <p className="px-1 text-xs leading-relaxed">
          <span className="font-semibold">{label}</span>
          <span className="text-muted-foreground"> · {location}</span>
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

function AccessChip({
  onActionToggle,
  onPresetChange,
  permissionKeys,
  row,
}: {
  onActionToggle: (action: PermissionAccessAction) => void
  onPresetChange: (level: PermissionAccessLevel) => void
  permissionKeys: readonly string[]
  row: PermissionAccessRow
}) {
  const level = permissionAccessLevelForKeys(row, permissionKeys)
  const summary = permissionAccessSummary(row, permissionKeys)
  const granted = new Set(permissionKeys)
  const presets = [
    ["none", "No Access"],
    ["view", "View Only"],
    ["full", "Full Access"],
    ["custom", "Custom"],
  ] as const satisfies readonly (readonly [PermissionAccessLevel, string])[]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${row.label} access: ${summary}`}
          className="h-8 w-full min-w-0 justify-between rounded-full px-3 text-xs font-medium"
          size="sm"
          type="button"
          variant={level === "none" ? "outline" : "secondary"}
        >
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <p className="font-semibold">{row.label}</p>
        <p className="text-xs text-muted-foreground">
          {row.actions.length === 1
            ? row.readPermissionKeys.length > 0
              ? "This entry has View access only. Save, Delete and other actions are controlled by their task permissions."
              : "This task has one action. Use No Access to deny it or Full Access to allow it. View Only does not apply."
            : "View Only allows reading where available. Full Access allows every listed action. Custom lets you choose individual actions below."}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map(([preset, label]) => (
            <Button
              aria-pressed={level === preset}
              className="justify-start"
              disabled={
                preset === "view" && row.readPermissionKeys.length === 0
              }
              key={preset}
              onClick={() => onPresetChange(preset)}
              size="sm"
              type="button"
              variant={level === preset ? "secondary" : "ghost"}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Applicable actions
          </p>
          <div className="grid gap-2.5">
            {row.actions.map((action) => {
              const checked = action.permissionKeys.every((key) =>
                granted.has(key)
              )
              return (
                <div
                  className="flex items-center gap-2.5 text-sm"
                  key={`${row.id}:${action.label}`}
                >
                  <Checkbox
                    aria-label={action.label}
                    checked={checked}
                    onCheckedChange={() => onActionToggle(action)}
                  />
                  <PermissionPreviewLabel
                    label={action.label}
                    location={`${row.module} / ${row.submodule} / ${row.label}`}
                    noScreen={action.permissionKeys.every((key) =>
                      apiOnlyPermissionKeys.has(key)
                    )}
                    onClick={() => onActionToggle(action)}
                    preview={permissionPreview(row, action)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
