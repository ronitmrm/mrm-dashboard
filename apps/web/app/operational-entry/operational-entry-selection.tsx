"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, ListChecks } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import {
  availableOperationalEntryMains,
  operationalEntryOpenHref,
  operationalEntryUnitOptions,
  operationalSubEntriesFor,
  resolveOperationalEntrySelection,
  type OperationalEntryModuleAccess,
  type OperationalEntryView,
} from "@/lib/operational-entry-module"
import type { MasterUnit } from "@/lib/master-module"

type PartialSelection = {
  main: string
  sub: string
  unit: MasterUnit | ""
}

function selectionPageHref(
  selection: PartialSelection,
  view: OperationalEntryView
) {
  const params = new URLSearchParams()
  if (selection.unit) params.set("unit", selection.unit)
  if (selection.main) params.set("main", selection.main)
  if (selection.sub) params.set("sub", selection.sub)
  if (view === "masterTables") params.set("view", view)
  const query = params.toString()
  return query ? "/operational-entry?" + query : "/operational-entry"
}

function restoredSelection(
  initial: PartialSelection,
  access: OperationalEntryModuleAccess,
  view: OperationalEntryView
): PartialSelection {
  if (initial.unit || typeof window === "undefined") return initial
  const storageKey = "operational-entry-selection:" + view
  const stored = window.sessionStorage.getItem(storageKey)
  if (!stored) return initial
  try {
    const candidate = JSON.parse(stored) as PartialSelection
    return resolveOperationalEntrySelection(candidate, access, view)
      ? candidate
      : initial
  } catch {
    window.sessionStorage.removeItem(storageKey)
    return initial
  }
}

export function OperationalEntrySelection({
  access,
  initial,
  view,
}: {
  access: OperationalEntryModuleAccess
  initial: PartialSelection
  view: OperationalEntryView
}) {
  const router = useRouter()
  const [selection, setSelection] = useState(() =>
    restoredSelection(initial, access, view)
  )
  const mainEntries = useMemo(
    () =>
      selection.unit
        ? availableOperationalEntryMains(selection.unit, access, view)
        : [],
    [access, selection.unit, view]
  )
  const subEntries = selection.main
    ? operationalSubEntriesFor(selection.main, access, view)
    : []
  const resolved = resolveOperationalEntrySelection(selection, access, view)
  const storageKey = "operational-entry-selection:" + view

  useEffect(() => {
    if (!selection.unit) return
    window.sessionStorage.setItem(storageKey, JSON.stringify(selection))
    if (!initial.unit) {
      window.history.replaceState(null, "", selectionPageHref(selection, view))
    }
  }, [initial.unit, selection, storageKey, view])

  function update(next: PartialSelection) {
    setSelection(next)
    window.sessionStorage.setItem(storageKey, JSON.stringify(next))
    window.history.replaceState(null, "", selectionPageHref(next, view))
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border bg-muted p-2">
            <ListChecks className="size-5" />
          </div>
          <div>
            <CardTitle>
              {view === "masterTables"
                ? "Operational Table Selection"
                : "Operational Entry Selection"}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-5 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="operational-unit">Unit</FieldLabel>
            <NativeSelect
              id="operational-unit"
              onChange={(event) =>
                update({
                  main: "",
                  sub: "",
                  unit: event.target.value as MasterUnit | "",
                })
              }
              value={selection.unit}
            >
              <NativeSelectOption value="">Select Unit</NativeSelectOption>
              {operationalEntryUnitOptions.map(({ id, label }) => (
                <NativeSelectOption key={id} value={id}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="operational-main">Main Entry</FieldLabel>
            <NativeSelect
              disabled={!selection.unit}
              id="operational-main"
              onChange={(event) =>
                update({
                  ...selection,
                  main: event.target.value,
                  sub: "",
                })
              }
              value={selection.main}
            >
              <NativeSelectOption value="">
                Select Main Entry
              </NativeSelectOption>
              {mainEntries.map(({ id, label }) => (
                <NativeSelectOption key={id} value={id}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {selection.unit && !mainEntries.length ? (
              <FieldDescription>
                No permitted operational entries are available for this Unit.
              </FieldDescription>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="operational-sub">Entry Form</FieldLabel>
            <NativeSelect
              disabled={!selection.main || !subEntries.length}
              id="operational-sub"
              onChange={(event) =>
                update({ ...selection, sub: event.target.value })
              }
              value={selection.sub}
            >
              <NativeSelectOption value="">
                Select Entry Form
              </NativeSelectOption>
              {subEntries.map(({ id, label }) => (
                <NativeSelectOption key={id} value={id}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <div className="flex justify-end border-t pt-5">
          <Button
            disabled={!resolved}
            onClick={() => {
              if (resolved)
                router.push(operationalEntryOpenHref(resolved, view))
            }}
            type="button"
          >
            {view === "masterTables" ? "Open Table" : "Open Form"}{" "}
            <ArrowRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
