"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@workspace/ui/components/button"

export function StorePurchaseOrderForm({
  action,
  formId,
  orderDate,
  remark,
  issuanceId,
}: {
  action: (formData: FormData) => Promise<void>
  formId: string
  orderDate: string
  remark: string
  issuanceId: string
}) {
  const [error, setError] = useState<string | null>(null)

  function validateSelection(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget
    const values = new FormData(form)
    const selectedIds = values.getAll("item_type_id").map(String)

    if (!selectedIds.length) {
      event.preventDefault()
      setError("Select at least one Asset Code to order.")
      return
    }

    const missingQuantityId = selectedIds.find((id) => {
      const quantity = Number(values.get(`quantity_${id}`)?.toString())
      return !Number.isFinite(quantity) || quantity <= 0
    })
    if (missingQuantityId) {
      event.preventDefault()
      const checkbox = Array.from(form.elements).find(
        (element): element is HTMLInputElement =>
          element instanceof HTMLInputElement &&
          element.name === "item_type_id" &&
          element.value === missingQuantityId
      )
      setError(
        `Enter an order quantity for ${checkbox?.dataset.assetCode ?? "each selected Asset Code"}.`
      )
      return
    }

    setError(null)
  }

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-3"
      id={formId}
      onSubmit={validateSelection}
    >
      <input defaultValue={issuanceId} name="issuance_id" type="hidden" />
      <input defaultValue={orderDate} name="order_date" type="hidden" />
      <input defaultValue={remark} name="remark" type="hidden" />
      <Button className="w-fit" type="submit">
        Save Supplier Purchase Orders
      </Button>
      <span className="text-sm text-muted-foreground">
        Selected items are automatically split into one PO per Supplier.
      </span>
      {error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
