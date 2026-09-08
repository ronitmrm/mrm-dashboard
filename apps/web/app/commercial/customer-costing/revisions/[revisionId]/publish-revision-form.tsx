"use client"

import { useActionState } from "react"
import { Button } from "@workspace/ui/components/button"
import { publishProductBulkRevisionAction } from "../../../revisions/actions"

export function PublishRevisionForm({
  revisionId,
  disabled,
}: {
  revisionId: string
  disabled: boolean
}) {
  const [state, publish, pending] = useActionState(
    publishProductBulkRevisionAction,
    { error: null }
  )
  return (
    <form action={publish} className="grid gap-2">
      <input name="bulk_price_revision_id" type="hidden" value={revisionId} />
      <Button disabled={disabled || pending} type="submit">
        {pending ? "Publishing Revision…" : "Complete And Publish Revision"}
      </Button>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Publishing all affected prices. Please keep this page open.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
