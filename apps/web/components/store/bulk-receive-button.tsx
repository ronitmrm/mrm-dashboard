"use client"

import * as React from "react"

import { PendingRetainedUploadForm } from "@/components/pending-retained-upload-form"
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

type Selection = {
  count: number
  orderNumber: string
  purchaseOrderId: string
}

const emptySelection: Selection = {
  count: 0,
  orderNumber: "",
  purchaseOrderId: "",
}

function selectedLines(formId: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[name="purchase_order_line_id"]'
    )
  ).filter(
    (input) =>
      input.getAttribute("form") === formId && input.checked && !input.disabled
  )
}

function selectedReceipt(formId: string): Selection {
  const lines = selectedLines(formId)
  const first = lines[0]
  return first
    ? {
        count: lines.length,
        orderNumber: first.dataset.selectionGroupLabel ?? "",
        purchaseOrderId: first.dataset.selectionGroup ?? "",
      }
    : emptySelection
}

export function BulkReceiveButton({
  action,
  formId,
}: {
  action: (data: FormData) => void | Promise<unknown>
  formId: string
}) {
  const [open, setOpen] = React.useState(false)
  const [selection, setSelection] = React.useState(emptySelection)

  const syncSelection = React.useCallback(() => {
    setSelection(selectedReceipt(formId))
  }, [formId])

  React.useEffect(() => {
    const handleChange = (event: Event) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement &&
        target.getAttribute("form") === formId &&
        target.name === "purchase_order_line_id"
      ) {
        syncSelection()
      }
    }
    document.addEventListener("change", handleChange)
    return () => document.removeEventListener("change", handleChange)
  }, [formId, syncSelection])

  React.useEffect(() => {
    if (!open) return
    const form = document.getElementById(formId)
    if (!(form instanceof HTMLFormElement)) return
    const handleReset = () => {
      queueMicrotask(() => {
        setOpen(false)
        syncSelection()
      })
    }
    form.addEventListener("reset", handleReset)
    return () => form.removeEventListener("reset", handleReset)
  }, [formId, open, syncSelection])

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) syncSelection()
        setOpen(nextOpen)
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={selection.count === 0} size="sm" type="button">
          Receive Selected ({selection.count})
        </Button>
      </DialogTrigger>
      <StandardDialogContent
        description={
          <>
            {selection.count} selected{" "}
            {selection.count === 1 ? "line" : "lines"}
            {selection.orderNumber ? ` from ${selection.orderNumber}` : ""} will
            be received at their full remaining quantities into Main Store.
            Receipt details below apply to every selected line.
          </>
        }
        title="Receive selected Purchase Order lines"
      >
        <PendingRetainedUploadForm
          action={action}
          uploads={
            selection.purchaseOrderId
              ? [
                  {
                    field: "guarantee_card",
                    intent: {
                      kind: "store-guarantee-card" as const,
                      purchaseOrderId: selection.purchaseOrderId,
                    },
                  },
                ]
              : []
          }
          className="grid gap-5"
          encType="multipart/form-data"
          id={formId}
        >
          <input
            name="purchase_order_id"
            type="hidden"
            value={selection.purchaseOrderId}
          />
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bulk-receipt-bill-number">
                Supplier Bill Number (optional)
              </FieldLabel>
              <Input id="bulk-receipt-bill-number" name="bill_number" />
            </Field>
            <Field>
              <FieldLabel htmlFor="bulk-receipt-bill-date">
                Supplier Bill Date (optional)
              </FieldLabel>
              <Input id="bulk-receipt-bill-date" name="bill_date" type="date" />
            </Field>
            <Field>
              <FieldLabel htmlFor="bulk-receipt-warranty">
                Warranty / Guarantee Until (optional)
              </FieldLabel>
              <Input
                id="bulk-receipt-warranty"
                name="warranty_until"
                type="date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bulk-receipt-card">
                Warranty / Guarantee Document (optional)
              </FieldLabel>
              <Input
                accept="application/pdf,image/jpeg,image/png"
                id="bulk-receipt-card"
                name="guarantee_card"
                type="file"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={selection.count === 0} type="submit">
              Receive {selection.count}{" "}
              {selection.count === 1 ? "Line" : "Lines"}
            </Button>
          </DialogFooter>
        </PendingRetainedUploadForm>
      </StandardDialogContent>
    </Dialog>
  )
}
