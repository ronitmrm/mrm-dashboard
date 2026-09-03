"use client"

import { useActionState, useId, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { deleteRoleAction } from "./actions"

type RoleDeleteControlProps = {
  roleId: string
  roleKey: string
  roleName: string
  section: "roles" | "staff"
}

export function RoleDeleteControl(props: RoleDeleteControlProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={props.section === "staff" ? "icon-xs" : "sm"}
          variant="destructive"
          aria-label={`Delete role ${props.roleName} everywhere`}
          title={`Delete role ${props.roleName} everywhere`}
        >
          <Trash2 aria-hidden="true" />
          {props.section === "roles" ? "Delete" : null}
        </Button>
      </DialogTrigger>
      {open ? (
        <RoleDeleteConfirmation {...props} onCancel={() => setOpen(false)} />
      ) : null}
    </Dialog>
  )
}

function RoleDeleteConfirmation({
  roleId,
  roleKey,
  roleName,
  section,
  onCancel,
}: RoleDeleteControlProps & { onCancel: () => void }) {
  const [state, action, pending] = useActionState(deleteRoleAction, {})
  const confirmationId = useId()
  const [confirmation, setConfirmation] = useState("")
  return (
    <StandardDialogContent
      title={`Delete ${roleName}?`}
      description="This permanently deletes the role everywhere, including all staff and approved-post assignments. It does not just remove one staff member's assignment."
      showCloseButton={!pending}
      onEscapeKeyDown={(event) => {
        if (pending) event.preventDefault()
      }}
      onInteractOutside={(event) => {
        if (pending) event.preventDefault()
      }}
    >
      <form action={action} className="grid gap-4">
        <input name="roleId" type="hidden" value={roleId} />
        <input name="section" type="hidden" value={section} />
        <p className="text-sm text-muted-foreground">
          Staff accounts, Employee Master, approved posts, other roles and audit
          history remain unchanged.
        </p>
        <Field>
          <FieldLabel htmlFor={confirmationId}>Confirm role key</FieldLabel>
          <Input
            id={confirmationId}
            name="confirmation"
            autoComplete="off"
            required
            value={confirmation}
            disabled={pending}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <FieldDescription>
            Type <span className="font-medium break-all">{roleKey}</span>{" "}
            exactly.
          </FieldDescription>
        </Field>
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || confirmation !== roleKey}
          >
            {pending ? "Deleting…" : "Delete Role Everywhere"}
          </Button>
        </DialogFooter>
      </form>
    </StandardDialogContent>
  )
}
