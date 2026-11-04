"use client"

import type { ParallelMachineReview, ParallelWipDecision } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { RecordDetails, StandardState } from "./ui/golden-patterns"

export function ParallelMachineReadinessReview({
  review,
  busy,
  error,
  decision,
  onCalculate,
  onDecision,
}: {
  review: ParallelMachineReview | null
  busy: boolean
  error: string
  decision: ParallelWipDecision | ""
  onCalculate: () => void
  onDecision: (decision: ParallelWipDecision | "") => void
}) {
  return (
    <div className="grid gap-3" aria-busy={busy}>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={busy}
        onClick={onCalculate}
      >
        {busy
          ? "Calculating start readiness…"
          : review
            ? "Recalculate start readiness"
            : "Calculate start readiness"}
      </Button>
      {error ? (
        <StandardState
          variant="error"
          title="Unable to calculate start readiness"
          description={error}
        />
      ) : null}
      {review ? (
        <>
          <RecordDetails
            items={[
              {
                label: "Machines after adding",
                value: String(review.machineCount),
              },
              {
                label: "Available WIP",
                value:
                  review.availableWip === null
                    ? "First setup — no upstream WIP required"
                    : `${Math.floor(review.availableWip).toLocaleString("en-IN")} pcs`,
              },
              {
                label: "Required WIP buffer",
                value:
                  review.requiredWip === null
                    ? "Not required"
                    : `${Math.ceil(review.requiredWip).toLocaleString("en-IN")} pcs (${review.bufferDays} days)`,
              },
              {
                label: "Normal setup start",
                value: review.plannedStart || "Blocked",
              },
              {
                label: "Normal finish",
                value: review.plannedFinish || "Unavailable",
              },
              ...(decision === "start_early"
                ? [
                    {
                      label: "Approved early setup start",
                      value: review.earlyPlannedStart || "Unavailable",
                    },
                    {
                      label: "Early-start finish",
                      value: review.earlyPlannedFinish || "Unavailable",
                    },
                  ]
                : []),
            ]}
          />
          <StandardState
            title={review.ready ? "Ready to start" : "Normal start blocked"}
            description={
              review.ready
                ? "The proposed machine passes the current WIP, date, tooling and machine checks."
                : review.blocker || "This machine cannot start yet."
            }
          />
          {!review.ready ? (
            <Field>
              <FieldLabel htmlFor="parallel-wip-decision">
                How should this machine be added?
              </FieldLabel>
              <NativeSelect
                id="parallel-wip-decision"
                value={decision}
                onValueChange={(value) =>
                  onDecision(
                    value === "queue" || value === "start_early" ? value : ""
                  )
                }
              >
                <NativeSelectOption value="">
                  Choose how to proceed
                </NativeSelectOption>
                <NativeSelectOption value="queue">
                  Queue for calculated start
                </NativeSelectOption>
                {review.earlyStartAllowed ? (
                  <NativeSelectOption value="start_early">
                    Approve early start using available WIP
                  </NativeSelectOption>
                ) : null}
              </NativeSelect>
              <FieldDescription>
                {decision === "start_early"
                  ? "Approves the WIP-buffer exception. Current machines keep running; output remains limited to recorded WIP. Normal setup and quality checks still apply."
                  : review.earlyStartAllowed
                    ? "Queuing keeps the calculated start. An early start requires explicit approval of the WIP-buffer exception."
                    : review.earlyStartBlocker}
              </FieldDescription>
            </Field>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
