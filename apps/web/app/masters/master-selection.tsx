"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Database } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
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
  availableMainMasters,
  masterOpenHref,
  masterUnitOptions,
  resolveMasterSelection,
  subMastersFor,
  type MasterModuleAccess,
  type MasterUnit,
} from "@/lib/master-module"

type PartialSelection = { main: string; sub: string; unit: MasterUnit | "" }

function selectionPageHref(selection: PartialSelection) {
  const params = new URLSearchParams()
  if (selection.unit) params.set("unit", selection.unit)
  if (selection.main) params.set("main", selection.main)
  if (selection.sub) params.set("sub", selection.sub)
  const query = params.toString()
  return query ? `/masters?${query}` : "/masters"
}

function restoredSelection(
  initial: PartialSelection,
  access: MasterModuleAccess
): PartialSelection {
  if (initial.unit || typeof window === "undefined") return initial
  const stored = window.sessionStorage.getItem("master-module-selection")
  if (!stored) return initial
  try {
    const candidate = JSON.parse(stored) as PartialSelection
    return resolveMasterSelection(candidate, access) ? candidate : initial
  } catch {
    window.sessionStorage.removeItem("master-module-selection")
    return initial
  }
}
export function MasterSelection({
  access,
  initial,
}: {
  access: MasterModuleAccess
  initial: PartialSelection
}) {
  const router = useRouter()
  const [selection, setSelection] = useState(() =>
    restoredSelection(initial, access)
  )
  const mainMasters = useMemo(
    () => (selection.unit ? availableMainMasters(selection.unit, access) : []),
    [access, selection.unit]
  )
  const subMasterResult = selection.main
    ? subMastersFor(selection.main, access)
    : null
  const resolved = resolveMasterSelection(selection, access)
  useEffect(() => {
    if (!selection.unit) return
    window.sessionStorage.setItem(
      "master-module-selection",
      JSON.stringify(selection)
    )
    if (!initial.unit) {
      window.history.replaceState(null, "", selectionPageHref(selection))
    }
  }, [initial.unit, selection])
  function update(next: PartialSelection) {
    setSelection(next)
    window.sessionStorage.setItem(
      "master-module-selection",
      JSON.stringify(next)
    )
    window.history.replaceState(null, "", selectionPageHref(next))
  }

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border bg-muted p-2">
            <Database className="size-5" />
          </div>
          <div>
            <CardTitle>Master Selection</CardTitle>
            <CardDescription>
              Select the Unit, Main Master, and Sub Master in order.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-5 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="master-unit">Unit</FieldLabel>
            <NativeSelect
              id="master-unit"
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
              {masterUnitOptions.map(({ id, label }) => (
                <NativeSelectOption key={id} value={id}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="main-master">Main Master</FieldLabel>
            <NativeSelect
              disabled={!selection.unit}
              id="main-master"
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
                Select Main Master
              </NativeSelectOption>
              {mainMasters.map(({ id, label }) => (
                <NativeSelectOption key={id} value={id}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {selection.unit && !mainMasters.length ? (
              <FieldDescription>
                No permitted Main Masters are available for this Unit.
              </FieldDescription>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="sub-master">Sub Master</FieldLabel>
            <NativeSelect
              disabled={!selection.main || !subMasterResult}
              id="sub-master"
              onChange={(event) =>
                update({ ...selection, sub: event.target.value })
              }
              value={selection.sub}
            >
              <NativeSelectOption value="">
                Select Sub Master
              </NativeSelectOption>
              {subMasterResult?.options.map(({ id, label }) => (
                <NativeSelectOption key={id} value={id}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {subMasterResult?.fallback ? (
              <FieldDescription>
                No sub-master — main master used
              </FieldDescription>
            ) : null}
          </Field>
        </div>

        <div className="flex justify-end border-t pt-5">
          <Button
            disabled={!resolved}
            onClick={() => {
              if (resolved) router.push(masterOpenHref(resolved))
            }}
            type="button"
          >
            Open Form <ArrowRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
