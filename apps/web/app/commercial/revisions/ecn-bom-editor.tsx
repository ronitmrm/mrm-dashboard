"use client"

import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"

import { ecnProductOptionLabel } from "../../../lib/pricing/ecn-routes"

type ItemOption = {
  category?: string | null
  description: string
  id: string
  subcategory?: string | null
  uid: string
}

type BomLine = {
  componentItemId: string
  notes: string | null
  quantity: number
  uid: string
  description: string
}

export function EcnBomEditor({
  initialLines = [],
  items,
  parentItemId,
}: {
  initialLines?: BomLine[]
  items: ItemOption[]
  parentItemId: string
}) {
  const [replaceBom, setReplaceBom] = useState(false)
  const [rows, setRows] = useState(
    initialLines.length
      ? initialLines.map((line, key) => ({
          componentItemId: line.componentItemId,
          key,
          notes: line.notes ?? "",
          quantity: line.quantity,
        }))
      : [{ componentItemId: "", key: 0, notes: "", quantity: 1 }]
  )
  const nextKey = useRef(1)
  const componentItems = items.filter((item) => item.id !== parentItemId)

  if (!replaceBom) {
    return (
      <div className="rounded-2xl border border-dashed p-3">
        <input name="bom_mode" type="hidden" value="preserve" />
        <input
          name="bom_lines_json"
          type="hidden"
          value={JSON.stringify(
            initialLines.map((line) => ({
              componentItemId: line.componentItemId,
              notes: line.notes,
              quantity: line.quantity,
            }))
          )}
        />
        <p className="text-sm text-muted-foreground">
          The current normalized BOM will be preserved.
        </p>
        {initialLines.length ? (
          <div className="mt-3 grid gap-2">
            {initialLines.map((line) => (
              <div
                className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                key={line.componentItemId}
              >
                <span>
                  {line.uid} · {line.description}
                </span>
                <span className="tabular-nums">Qty {line.quantity}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            This Product has no BOM lines.
          </p>
        )}
        <Button
          className="mt-2"
          onClick={() => setReplaceBom(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Edit Or Replace Bom
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-2xl border p-3">
      <input name="bom_mode" type="hidden" value="replace" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Replacement Bom</p>
          <p className="text-xs text-muted-foreground">
            Save Zero Rows To Clear The Bom. Components Must Stay Unique.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  componentItemId: "",
                  key: nextKey.current++,
                  notes: "",
                  quantity: 1,
                },
              ])
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Add Component
          </Button>
          <Button
            onClick={() => {
              setReplaceBom(false)
              setRows([
                {
                  componentItemId: "",
                  key: nextKey.current++,
                  notes: "",
                  quantity: 1,
                },
              ])
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Preserve Current Bom
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
            <SearchableSelect
              defaultValue={row.componentItemId}
              name="bom_component_item_id"
              required
              searchPlaceholder="Search UID, category, subcategory, or name..."
            >
              <option value="">Select component</option>
              {componentItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {ecnProductOptionLabel(item)}
                </option>
              ))}
            </SearchableSelect>
          </Field>
          <Field>
            <FieldLabel>Quantity</FieldLabel>
            <Input
              defaultValue={row.quantity}
              min="0.00000001"
              name="bom_quantity"
              required
              step="any"
              type="number"
            />
          </Field>
          <Field>
            <FieldLabel>Notes</FieldLabel>
            <Input defaultValue={row.notes} name="bom_notes" />
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
