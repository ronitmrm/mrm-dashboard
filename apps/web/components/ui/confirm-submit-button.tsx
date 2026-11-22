"use client"

import { useRef, useState, type ComponentProps, type ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogFooter,
} from "@workspace/ui/components/dialog"

import { StandardDialogContent } from "./golden-patterns"

/** Submit button that asks for confirmation in the app's dialog before submitting its form. */
export function ConfirmSubmitButton({
  confirmTitle,
  confirmDescription,
  confirmLabel = "Confirm",
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "onClick"> & {
  confirmTitle: string
  confirmDescription?: ReactNode
  confirmLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button {...props} ref={trigger} type="button" onClick={() => setOpen(true)} />
      <StandardDialogContent title={confirmTitle} description={confirmDescription}>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant={props.variant === "destructive" ? "destructive" : "default"}
            onClick={() => {
              setOpen(false)
              trigger.current?.form?.requestSubmit()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </StandardDialogContent>
    </Dialog>
  )
}
