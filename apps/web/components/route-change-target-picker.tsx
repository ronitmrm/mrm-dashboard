"use client"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"

type WorkOrder = Record<string, unknown>

const text = (value: unknown) => String(value ?? "").trim()

export function RouteChangeTargetPicker({
  onPartCodeChange,
  onTargetChange,
  partCode,
  target,
  workOrders,
}: {
  onPartCodeChange: (partCode: string) => void
  onTargetChange: (jobCard: string) => void
  partCode: string
  target: string
  workOrders: ReadonlyArray<WorkOrder>
}) {
  const partKey = partCode.trim().toLowerCase()
  const partJobCards = partKey
    ? workOrders.filter(
        (row) => text(row.jcNo) && text(row.partCode).toLowerCase() === partKey
      )
    : []
  const partCodes = [
    ...new Set(workOrders.map((row) => text(row.partCode)).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return (
    <>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="route-change-item">Item Code</FieldLabel>
        <SearchableSelect
          id="route-change-item"
          aria-label="Item Code"
          className="h-9"
          value={partCode}
          required
          onValueChange={onPartCodeChange}
        >
          <option value="">Select Item</option>
          {partCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </SearchableSelect>
      </Field>
      <Field className="gap-1.5" data-disabled={!partJobCards.length}>
        <FieldLabel htmlFor="route-change-job-card">Job Card</FieldLabel>
        <SearchableSelect
          id="route-change-job-card"
          aria-label="Job Card"
          className="h-9"
          disabled={!partJobCards.length}
          required
          value={target}
          onValueChange={onTargetChange}
        >
          <option value="">
            {partKey ? "Select Job Card" : "Select Item First"}
          </option>
          {partJobCards.map((row) => (
            <option key={text(row.jcNo)} value={text(row.jcNo)}>
              {text(row.jcNo)}
              {text(row.fgPoNo) ? ` · FG PO ${text(row.fgPoNo)}` : ""}
            </option>
          ))}
        </SearchableSelect>
      </Field>
    </>
  )
}
