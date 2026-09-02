"use client"

import { ChevronDown, Search, X } from "lucide-react"
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
  type PermissionAccessLevel,
  type PermissionAccessAction,
  type PermissionAccessRow,
  type PermissionOption,
  normalizePermissionKeys,
  permissionAccessLevelForKeys,
  permissionAccessRows,
  permissionAccessSummary,
  permissionKeysForActionToggle,
  permissionKeysForPreset,
} from "./permission-access"

export function PermissionSelector({
  initialPermissionKeys = [],
  permissions,
}: {
  initialPermissionKeys?: readonly string[]
  permissions: readonly PermissionOption[]
}) {
  const [query, setQuery] = useState("")
  const rows = useMemo(() => permissionAccessRows(permissions), [permissions])
  const [permissionKeys, setPermissionKeys] = useState<string[]>(() => {
    const assignable = new Set(rows.flatMap((row) => row.fullPermissionKeys))
    return initialPermissionKeys.filter((key) => assignable.has(key)).sort()
  })
  const normalizedQuery = query.trim().toLowerCase()
  const visibleRows = rows.filter(
    (row) =>
      !normalizedQuery ||
      row.module.toLowerCase().includes(normalizedQuery) ||
      row.submodule.toLowerCase().includes(normalizedQuery) ||
      row.label.toLowerCase().includes(normalizedQuery) ||
      row.fullPermissionKeys.some((key) =>
        key.toLowerCase().includes(normalizedQuery)
      )
  )
  const selectedPermissionKeys = normalizePermissionKeys(permissionKeys)
  const configuredCount = rows.filter(
    (row) => permissionAccessLevelForKeys(row, permissionKeys) !== "none"
  ).length

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
    <FieldSet className="gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FieldLegend>Capabilities</FieldLegend>
          <FieldDescription>
            Set a preset or open Custom to choose only the actions this role
            needs. Modifying actions keep View selected when available.
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
          <Button onClick={() => setQuery("")} type="button" variant="outline">
            <X /> Clear
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border">
        <OperationalTable
          containerClassName="max-h-[min(34rem,calc(100svh-16rem))]"
          filterStorageKey="access-administration-permissions"
        >
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-48">Main Module</TableHead>
              <TableHead className="w-48">Sub Module</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead>Page / Task</TableHead>
              <TableHead className="w-52">Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground capitalize">
                    {row.module}
                  </TableCell>
                  <TableCell>{row.submodule}</TableCell>
                  <TableCell>
                    <Badge
                      variant={row.kind === "page" ? "default" : "outline"}
                    >
                      {row.kind === "page" ? "Page" : "Task"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.label}</span>
                    {row.href ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.href}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
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
                  colSpan={5}
                >
                  No Pages Or Tasks Match This Search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </OperationalTable>
      </div>
    </FieldSet>
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
          className="h-8 w-full min-w-44 justify-between rounded-full px-3 text-xs font-medium"
          size="sm"
          type="button"
          variant={level === "none" ? "outline" : "secondary"}
        >
          <span className="max-w-40 truncate">{summary}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
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
                <label
                  className="flex cursor-pointer items-center gap-2.5 text-sm"
                  key={`${row.id}:${action.label}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onActionToggle(action)}
                  />
                  <span>{action.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
