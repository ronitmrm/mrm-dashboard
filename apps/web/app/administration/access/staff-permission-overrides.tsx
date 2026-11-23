"use client"

import { ChevronDown, Search, X } from "lucide-react"
import { useActionState, useMemo, useState } from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldLabel,
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

import { setStaffPermissionOverridesAction } from "./actions"
import {
  type PermissionAccessRow,
  type PermissionOption,
  permissionAccessPageLabels,
  staffOverrideRows,
} from "./permission-access"
import { permissionRowPreview } from "./permission-preview"
import { ScreenPreview } from "./permission-selector"

type Effect = "allow" | "deny"

export type StaffPermissionOverride = {
  effect: Effect
  expiresAt: string | null
  permissionKey: string
}

const choices = [
  ["roles", "From Roles"],
  ["allow", "Allow"],
  ["deny", "Block"],
] as const

function isActive({ expiresAt }: StaffPermissionOverride) {
  return !expiresAt || new Date(expiresAt) > new Date()
}

export function StaffPermissionOverridesForm({
  overrides,
  permissions,
  roleGrantedKeys,
  userId,
}: {
  overrides: readonly StaffPermissionOverride[]
  permissions: readonly PermissionOption[]
  /** Keys this person's direct and post roles grant. */
  roleGrantedKeys: ReadonlySet<string>
  userId: string
}) {
  const [state, action, pending] = useActionState(
    setStaffPermissionOverridesAction,
    {}
  )
  const rows = useMemo(
    () =>
      staffOverrideRows(permissions).map((row) => ({
        ...row,
        pages: permissionAccessPageLabels(row),
      })),
    [permissions]
  )
  const editableKeys = useMemo(
    () => new Set(rows.flatMap((row) => row.fullPermissionKeys)),
    [rows]
  )
  const [effects, setEffects] = useState(
    () =>
      new Map(
        overrides
          .filter(
            (override) =>
              isActive(override) && editableKeys.has(override.permissionKey)
          )
          .map(({ effect, permissionKey }) => [permissionKey, effect])
      )
  )
  const [query, setQuery] = useState("")
  const [onlyExceptions, setOnlyExceptions] = useState(false)
  const normalizedQuery = query.trim().toLowerCase()
  const visibleRows = rows.filter(
    (row) =>
      (!onlyExceptions ||
        row.fullPermissionKeys.some((key) => effects.has(key))) &&
      (!normalizedQuery ||
        [row.module, row.submodule, row.label, ...row.pages]
          .concat(row.actions.map(({ label }) => label))
          .some((text) => text.toLowerCase().includes(normalizedQuery)))
  )

  function setChoice(keys: readonly string[], choice: Effect | "roles") {
    setEffects((current) => {
      const next = new Map(current)
      for (const key of keys) {
        if (choice === "roles") next.delete(key)
        else next.set(key, choice)
      }
      return next
    })
  }

  return (
    <form action={action}>
      <input name="userId" type="hidden" value={userId} />
      {[...effects].map(([key, effect]) => (
        <input key={key} name={effect} type="hidden" value={key} />
      ))}
      <FieldSet className="min-w-0 gap-3" disabled={pending}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <FieldLegend variant="label">Individual Permissions</FieldLegend>
            <FieldDescription>
              Everything follows this person&apos;s roles unless you set Allow
              or Block here. Allow gives one action to this person only. Block
              takes it away even if a role gives it.
            </FieldDescription>
          </div>
          <Badge variant="secondary">{effects.size} exceptions</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search permissions for this person"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search, for example Store or Delete"
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
          <Field className="w-auto" orientation="horizontal">
            <Checkbox
              checked={onlyExceptions}
              id={`only-exceptions-${userId}`}
              onCheckedChange={(checked) => setOnlyExceptions(checked === true)}
            />
            <FieldLabel htmlFor={`only-exceptions-${userId}`}>
              Show only exceptions
            </FieldLabel>
          </Field>
        </div>

        <div className="min-w-0 rounded-lg border">
          <OperationalTable
            className="min-w-[60rem] table-fixed"
            containerClassName="max-h-[min(34rem,calc(100svh-16rem))]"
            filterStorageKey="access-administration-staff-overrides"
          >
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[15%]">Module</TableHead>
                <TableHead className="w-[17%]">Sub Module</TableHead>
                <TableHead className="w-[20%]">Screen</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead className="w-28">Preview</TableHead>
                <TableHead className="sticky right-0 w-52 bg-muted">
                  This Person
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="wrap-anywhere whitespace-normal text-muted-foreground">
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
                    <TableCell className="font-medium wrap-anywhere whitespace-normal">
                      {row.kind === "page" ? `Open ${row.label}` : row.label}
                    </TableCell>
                    <TableCell>
                      <ScreenPreview
                        label={row.label}
                        location={`${row.module} / ${row.submodule}`}
                        preview={permissionRowPreview(row)}
                      />
                    </TableCell>
                    <TableCell className="sticky right-0 bg-card">
                      <PersonAccessChip
                        effects={effects}
                        onChoice={setChoice}
                        roleGrantedKeys={roleGrantedKeys}
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
                    {onlyExceptions
                      ? "This person has no exceptions. Everything follows their roles."
                      : "No Pages Or Tasks Match This Search."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </OperationalTable>
        </div>

        {state.error || state.success ? (
          <Alert
            role={state.error ? "alert" : "status"}
            variant={state.error ? "destructive" : "default"}
          >
            <AlertDescription>{state.error ?? state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button className="w-fit" type="submit">
          {pending ? "Saving…" : "Save Individual Permissions"}
        </Button>
      </FieldSet>
    </form>
  )
}

function PersonAccessChip({
  effects,
  onChoice,
  roleGrantedKeys,
  row,
}: {
  effects: ReadonlyMap<string, Effect>
  onChoice: (keys: readonly string[], choice: Effect | "roles") => void
  roleGrantedKeys: ReadonlySet<string>
  row: PermissionAccessRow
}) {
  const allowed = (key: string) =>
    effects.has(key) ? effects.get(key) === "allow" : roleGrantedKeys.has(key)
  const actionAllowed = row.actions.map(({ permissionKeys }) =>
    permissionKeys.every(allowed)
  )
  const allowedCount = actionAllowed.filter(Boolean).length
  // Like roles: an allowed action needs its screen's View; blocking View blocks the row.
  function chooseForAction(keys: readonly string[], choice: Effect | "roles") {
    const isView = keys.every((key) => row.readPermissionKeys.includes(key))
    if (choice === "deny" && isView) {
      onChoice(row.fullPermissionKeys, "deny")
      return
    }
    onChoice(keys, choice)
    if (choice === "allow" && !isView) {
      const missingView = row.readPermissionKeys.filter((key) => !allowed(key))
      if (missingView.length) onChoice(missingView, "allow")
    }
  }
  const hasException = row.fullPermissionKeys.some((key) => effects.has(key))
  const summary =
    allowedCount === 0
      ? "No Access"
      : allowedCount === row.actions.length
        ? "Allowed"
        : `${allowedCount} of ${row.actions.length} allowed`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${row.label} for this person: ${summary}`}
          className="h-8 w-full min-w-0 justify-between rounded-full px-3 text-xs font-medium"
          size="sm"
          type="button"
          variant={
            hasException ? "default" : allowedCount ? "secondary" : "outline"
          }
        >
          <span className="min-w-0 truncate">
            {hasException ? `Exception · ${summary}` : `Roles · ${summary}`}
          </span>
          <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-3 p-3">
        <p className="font-semibold">{row.label}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {choices.map(([choice, label]) => (
            <Button
              key={choice}
              onClick={() => onChoice(row.fullPermissionKeys, choice)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {choice === "roles" ? "All From Roles" : `${label} All`}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 border-t pt-3">
          {row.actions.map((rowAction, index) => {
            const key = rowAction.permissionKeys[0]!
            const current = effects.get(key) ?? "roles"
            const fromRoles = rowAction.permissionKeys.every((permissionKey) =>
              roleGrantedKeys.has(permissionKey)
            )
            return (
              <div
                className="grid gap-1.5"
                key={`${row.id}:${rowAction.label}`}
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{rowAction.label}</span>
                  <span
                    className={
                      actionAllowed[index]
                        ? "text-xs text-primary"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {actionAllowed[index] ? "Allowed" : "Not allowed"}
                  </span>
                </div>
                <div
                  aria-label={`${rowAction.label} for this person`}
                  className="grid grid-cols-3 gap-1"
                  role="radiogroup"
                >
                  {choices.map(([choice, label]) => (
                    <Button
                      aria-checked={current === choice}
                      key={choice}
                      onClick={() =>
                        chooseForAction(rowAction.permissionKeys, choice)
                      }
                      role="radio"
                      size="sm"
                      type="button"
                      variant={
                        current !== choice
                          ? "outline"
                          : choice === "deny"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {choice === "roles"
                        ? `Roles: ${fromRoles ? "Yes" : "No"}`
                        : label}
                    </Button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
