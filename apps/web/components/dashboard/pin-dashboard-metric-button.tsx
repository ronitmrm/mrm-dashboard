"use client"

import { useActionState } from "react"
import { Check, LoaderCircle, Pin } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { pinCncDashboardCard, pinDashboardMetric } from "@/app/home/actions"
import type { CncDashboardCardId } from "@/lib/cnc-dashboard"
import type { DashboardMetricId } from "@/lib/dashboard-analytics"

const initialState = { message: "", status: "idle" }

export function PinDashboardMetricButton(
  props:
    | { metricId: DashboardMetricId }
    | { cardId: CncDashboardCardId; alreadyPinned: boolean; title: string }
) {
  const card = "cardId" in props ? props : null
  const [state, action, pending] = useActionState(
    card ? pinCncDashboardCard : pinDashboardMetric,
    initialState
  )
  const pinned =
    card?.alreadyPinned ||
    state.status === "pinned" ||
    state.status === "already-pinned"
  const label = pending
    ? "Adding to My Dashboard"
    : pinned
      ? state.message || "Already on My Dashboard"
      : card
        ? `Add ${card.title} to My Dashboard`
        : "Add to My Dashboard"

  return (
    <form action={action}>
      {"cardId" in props ? (
        <input name="cardId" type="hidden" value={props.cardId} />
      ) : (
        <input name="metricId" type="hidden" value={props.metricId} />
      )}
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
      {state.status === "error" ? (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
