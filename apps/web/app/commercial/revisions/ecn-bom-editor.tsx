"use client"

import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

type ItemOption = {
  description: string
  id: string
  uid: string
}

export function EcnBomEditor({
  items,
  parentItemId,
}: {
  items: ItemOption[]
  parentItemId: string
}) {
  const [replaceBom, setReplaceBom] = useState(false)
  const [rows, setRows] = useState([{ key: 0 }])
  const nextKey = useRef(1)
  const componentItems = items.filter((item) => item.id !== parentItemId)

  if (!replaceBom) {
    return (
      <div className="rounded-2xl border border-dashed p-3">
        <input name="bom_mode" type="hidden" value="preserve" />
        <p className="text-sm text-muted-foreground">
          The current normalized BOM will be preserved.
        </p>
        <Button
          className="mt-2"
          onClick={() => setReplaceBom(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Edit or replace BOM
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-2xl border p-3">
      <input name="bom_mode" type="hidden" value="replace" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Replacement BOM</p>
          <p className="text-xs text-muted-foreground">
            Save zero rows to clear the BOM. Components must stay unique.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              setRows((current) => [...current, { key: nextKey.current++ }])
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Add component
          </Button>
          <Button
            onClick={() => {
              setReplaceBom(false)
              setRows([{ key: nextKey.current++ }])
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Preserve current BOM
          </Button>
        </div>
      </div>
      {rows.map((row, index) => (
        <div
          className="grid gap-3 rounded-xl bg-muted/30 p-3 sm:grid-cols-[2fr_0.7fr_1.5fr_auto]"
          key={row.key}
        >
          <Field>
            <FieldLabel>Component {index + 1}</FieldLabel>
            <NativeSelect name="bom_component_item_id" required>
              {componentItems.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.uid} · {item.description}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Quantity</FieldLabel>
            <Input
              defaultValue="1"
              min="0.00000001"
              name="bom_quantity"
              required
              step="any"
              type="number"
            />
          </Field>
          <Field>
            <FieldLabel>Notes</FieldLabel>
            <Input name="bom_notes" />
          </Field>
          <Button
            className="self-end"
            onClick={() =>
              setRows((current) =>
                current.filter((candidate) => candidate.key !== row.key)
              )
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  )
}
