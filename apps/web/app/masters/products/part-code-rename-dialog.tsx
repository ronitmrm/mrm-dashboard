"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { renamePartCodeAction } from "./actions"

export function PartCodeRenameDialog({
  product,
  onClose,
  onSuccess,
}: {
  product: { itemId: string; uid: string }
  onClose: () => void
  onSuccess: (message: string, newCode: string) => void
}) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [newCode, setNewCode] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <StandardDialogContent
        title="Rename Part Code"
        description="Universal rename: applies across every production unit. Only the code changes. Routes, cycle times, type and other details stay the same. Issued documents keep their original codes."
      >
        <form
          action={(form) =>
            startTransition(async () => {
              setError("")
              const result = await renamePartCodeAction(form)
              if (result.error) {
                setError(result.error)
                return
              }
              onSuccess(result.message, result.newCode)
              router.refresh()
            })
          }
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="itemId" value={product.itemId} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-part-code">
                Current Part Code
              </FieldLabel>
              <Input
                id="current-part-code"
                name="currentCode"
                value={product.uid}
                readOnly
                translate="no"
              />
            </Field>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="new-part-code">New Part Code</FieldLabel>
              <Input
                id="new-part-code"
                name="newCode"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                required
                maxLength={100}
                autoComplete="off"
                aria-invalid={Boolean(error)}
                disabled={pending}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save New Code"}
            </Button>
          </DialogFooter>
        </form>
      </StandardDialogContent>
    </Dialog>
  )
}
