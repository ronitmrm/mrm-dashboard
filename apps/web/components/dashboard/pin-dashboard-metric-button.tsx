"use client"

import { useActionState } from "react"
import { Check, LoaderCircle, Pin } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { pinDashboardMetric } from "@/app/home/actions"
import type { DashboardMetricId } from "@/lib/dashboard-analytics"

const initialState = { message: "", status: "idle" }

export function PinDashboardMetricButton({
  metricId,
}: {
  metricId: DashboardMetricId
}) {
  const [state, action, pending] = useActionState(
    pinDashboardMetric,
    initialState
  )
  const pinned = state.status === "pinned" || state.status === "already-pinned"
  const label = pending
    ? "Adding to My Dashboard"
    : pinned
      ? state.message
      : "Add to My Dashboard"

  return (
    <form action={action}>
      <input name="metricId" type="hidden" value={metricId} />
      <Button
        aria-label={label}
        disabled={pending || pinned}
        size="icon-xs"
        title={label}
        type="submit"
        variant="ghost"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : pinned ? (
          <Check aria-hidden="true" />
        ) : (
          <Pin aria-hidden="true" />
        )}
      </Button>
      <span aria-live="polite" className="sr-only">
        {state.message}
      </span>
    </form>
  )
}
