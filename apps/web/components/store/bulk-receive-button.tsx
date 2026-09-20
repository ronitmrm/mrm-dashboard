"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

function selectedLineCount(formId: string) {
  const form = document.getElementById(formId)
  if (!(form instanceof HTMLFormElement)) return 0
  return Array.from(form.elements).filter(
    (element) =>
      element instanceof HTMLInputElement &&
      element.name === "purchase_order_line_id" &&
      element.checked &&
      !element.disabled
  ).length
}

export function BulkReceiveButton({ formId }: { formId: string }) {
  const [open, setOpen] = React.useState(false)
  const [selectedCount, setSelectedCount] = React.useState(0)

  const syncSelectedCount = React.useCallback(() => {
    setSelectedCount(selectedLineCount(formId))
  }, [formId])

  React.useEffect(() => {
    const form = document.getElementById(formId)
    if (!(form instanceof HTMLFormElement)) return
    const handleChange = (event: Event) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement &&
        target.form === form &&
        target.name === "purchase_order_line_id"
      ) {
        syncSelectedCount()
      }
    }
    const handleReset = () => {
      setOpen(false)
      setSelectedCount(0)
    }
    document.addEventListener("change", handleChange)
    form.addEventListener("reset", handleReset)
    return () => {
      document.removeEventListener("change", handleChange)
      form.removeEventListener("reset", handleReset)
    }
  }, [formId, syncSelectedCount])

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) syncSelectedCount()
        setOpen(nextOpen)
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={selectedCount === 0} size="sm" type="button">
          Receive Selected ({selectedCount})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive selected lines in full?</DialogTitle>
          <DialogDescription>
            {selectedCount} selected {selectedCount === 1 ? "line" : "lines"}{" "}
            will be received at the full remaining ordered quantity into Main
            Store. Optional supplier bill, warranty, and serial number fields
            will stay blank.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={selectedCount === 0}
            form={formId}
            type="submit"
          >
            Receive Selected in Full
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
