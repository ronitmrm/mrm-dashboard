"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { TimeInput } from "@workspace/ui/components/time-input"
import { CalendarClock } from "lucide-react"
import { useId } from "react"
import { useFormStatus } from "react-dom"

import { scheduleInterviewAction } from "@/app/hr/actions"
import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { formatIstTime, istDateValue } from "@/lib/date-time"

function RescheduleSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button disabled={pending} type="submit">
      {pending ? "Saving…" : "Save New Schedule"}
    </Button>
  )
}

export function InterviewRescheduleDialog({
  applicationId,
  candidateName,
  roundName,
  scheduledAt,
  returnJobId,
}: {
  applicationId: string
  candidateName: string
  roundName: string
  scheduledAt: string | null
  returnJobId?: string
}) {
  const fieldId = useId()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <CalendarClock data-icon="inline-start" />
          Reschedule
        </Button>
      </DialogTrigger>
      <StandardDialogContent
        className="sm:max-w-lg"
        description={`${candidateName} · ${roundName}. Change the interview date and time (IST).`}
        title="Reschedule Interview"
      >
        <form action={scheduleInterviewAction} className="grid gap-5">
          <input name="application_id" type="hidden" value={applicationId} />
          <input name="round_name" type="hidden" value={roundName} />
          {returnJobId ? (
            <input name="return_job_id" type="hidden" value={returnJobId} />
          ) : (
            <input name="panel" type="hidden" value="interviewsPanel" />
          )}
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${fieldId}-date`}>Interview Date</FieldLabel>
              <Input
                defaultValue={scheduledAt ? istDateValue(scheduledAt) : ""}
                id={`${fieldId}-date`}
                name="interview_date"
                required
                type="date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-time`}>
                Interview Time (IST)
              </FieldLabel>
              <TimeInput
                aria-label="Interview time"
                defaultValue={scheduledAt ? formatIstTime(scheduledAt) : ""}
                id={`${fieldId}-time`}
                name="interview_time"
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <RescheduleSubmitButton />
          </DialogFooter>
        </form>
      </StandardDialogContent>
    </Dialog>
  )
}
