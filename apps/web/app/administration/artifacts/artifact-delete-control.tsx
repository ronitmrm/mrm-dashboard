"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { AlertTriangle, Trash2 } from "lucide-react"
import { useActionState, useState } from "react"

import { deleteArtifactAction, type DeleteArtifactActionState } from "./actions"

const initialState: DeleteArtifactActionState = {}

export function ArtifactDeleteControl({
  artifactId,
  fileName,
  issued,
}: {
  artifactId: string
  fileName: string
  issued: boolean
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(
    deleteArtifactAction,
    initialState
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="xs"
          title={
            issued
              ? "Issued document deletion requires an additional permanent-unavailability warning."
              : undefined
          }
          variant="destructive"
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Artifact</DialogTitle>
          <DialogDescription>
            This deletes the logical Artifact and deactivates its business
            links. Shared stored bytes remain available until their final live
            Artifact is deleted.
          </DialogDescription>
        </DialogHeader>
        {issued ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Issued document</AlertTitle>
            <AlertDescription>
              Issued documents will remain unavailable after deletion and will
              not be reconstructed or regenerated.
            </AlertDescription>
          </Alert>
        ) : null}
        <form action={action} className="grid gap-4">
          <input name="artifactId" type="hidden" value={artifactId} />
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Confirm filename
            <Input
              autoComplete="off"
              name="confirmation"
              placeholder={fileName}
              required
            />
            <span className="text-xs font-normal break-all text-muted-foreground">
              Enter {fileName} exactly.
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Reason
            <Textarea
              maxLength={1000}
              name="reason"
              placeholder="Why is this Artifact being deleted?"
              required
            />
          </label>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={pending} type="submit" variant="destructive">
              {pending ? "Deleting…" : "Delete Artifact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
