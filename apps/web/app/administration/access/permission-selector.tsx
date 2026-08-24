"use client"

import { Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  type PermissionAccessLevel,
  type PermissionOption,
  permissionAccessRows,
  permissionKeysForSelections,
  permissionSelectionsForKeys,
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
  const [selections, setSelections] = useState<
    Record<string, PermissionAccessLevel>
  >(() => permissionSelectionsForKeys(rows, initialPermissionKeys))
  const normalizedQuery = query.trim().toLowerCase()
  const visibleRows = rows.filter(
    (row) =>
      (!normalizedQuery ||
        row.module.toLowerCase().includes(normalizedQuery) ||
        row.submodule.toLowerCase().includes(normalizedQuery) ||
        row.label.toLowerCase().includes(normalizedQuery) ||
        row.fullPermissionKeys.some((key) =>
          key.toLowerCase().includes(normalizedQuery)
        ))
  )
  const selectedPermissionKeys = permissionKeysForSelections(rows, selections)
  const configuredCount = Object.values(selections).filter(
    (level) => level !== "none"
  ).length

  function setAccess(id: string, level: PermissionAccessLevel) {
    setSelections((current) => ({ ...current, [id]: level }))
  }

  return (
    <FieldSet className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FieldLegend>Capabilities</FieldLegend>
          <FieldDescription>
            Pages are listed separately. Task permissions are shown only when
            they do not represent a page. Full Access includes Read Only.
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

      <div className="max-h-[36rem] overflow-y-auto rounded-lg border">
        <Table>
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
                    <NativeSelect
                      aria-label={`${row.label} access`}
                      className="w-full"
                      onChange={(event) =>
                        setAccess(
                          row.id,
                          event.target.value as PermissionAccessLevel
                        )
                      }
                      value={selections[row.id] ?? "none"}
                    >
                      <NativeSelectOption value="none">
                        No Access
                      </NativeSelectOption>
                      {row.supportedLevels.includes("read") ? (
                        <NativeSelectOption value="read">
                          Read Only
                        </NativeSelectOption>
                      ) : null}
                      {row.supportedLevels.includes("full") ? (
                        <NativeSelectOption value="full">
                          Full Access
                        </NativeSelectOption>
                      ) : null}
                    </NativeSelect>
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
        </Table>
      </div>
    </FieldSet>
  )
}
