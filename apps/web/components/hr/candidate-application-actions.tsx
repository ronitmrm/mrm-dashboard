"use client"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Textarea } from "@workspace/ui/components/textarea"
import { Input } from "@workspace/ui/components/input"
import { useFormStatus } from "react-dom"
import { UserCheck, UserX } from "lucide-react"

import {
  withdrawCandidateApplicationAction,
  recordCandidateDidNotJoinAction,
} from "@/app/hr/actions"
import { CandidateAppointmentDialog } from "@/components/hr/candidate-appointment-dialog"
import { StandardDrawerContent } from "@/components/ui/golden-patterns"
import { formatIstDate, istDateValue } from "@/lib/date-time"

function DidNotJoinSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Recording…" : "Record Did Not Join And Reopen Job"}
    </Button>
  )
}

export function CandidateApplicationActions({
  applicationId,
  candidateName,
  canCompleteAppointment,
  canRecordDidNotJoin = false,
  canWithdraw,
  defaultJoiningDate,
  panelId,
  returnJobId,
}: {
  applicationId: string
  candidateName: string
  canCompleteAppointment: boolean
  canRecordDidNotJoin?: boolean
  canWithdraw: boolean
  defaultJoiningDate: string | null
  panelId?: string
  returnJobId?: string
}) {
  const today = istDateValue(new Date())
  const joiningDateIsFuture = Boolean(
    defaultJoiningDate && defaultJoiningDate > today
  )
  if (!canCompleteAppointment && !canWithdraw && !canRecordDidNotJoin)
    return null

  return (
    <div className="flex justify-end gap-2">
      {canRecordDidNotJoin ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <UserX data-icon="inline-start" />
              Did Not Join
            </Button>
          </SheetTrigger>
          <StandardDrawerContent
            className="w-full overflow-y-auto sm:max-w-xl"
            title="Record Did Not Join"
            description={`Release ${candidateName}'s reserved vacancy and reopen this job. The offer letter and appointment history will be retained.`}
          >
            <form
              action={recordCandidateDidNotJoinAction}
              className="grid gap-5 px-6 pb-6"
            >
              <input
                name="application_id"
                type="hidden"
                value={applicationId}
              />
              {returnJobId ? (
                <input name="return_job_id" type="hidden" value={returnJobId} />
              ) : null}
              {panelId ? (
                <input name="panel" type="hidden" value={panelId} />
              ) : null}
              {joiningDateIsFuture ? (
                <p className="text-sm text-muted-foreground">
                  Non-joining can be recorded from{" "}
                  {formatIstDate(defaultJoiningDate)}.
                </p>
              ) : null}
              <Field>
                <FieldLabel htmlFor={`non-joining-date-${applicationId}`}>
                  Non-joining Date
                </FieldLabel>
                <Input
                  id={`non-joining-date-${applicationId}`}
                  name="did_not_join_on"
                  type="date"
                  required
                  min={defaultJoiningDate ?? undefined}
                  max={today}
                  defaultValue={joiningDateIsFuture ? "" : today}
                  disabled={joiningDateIsFuture}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`non-joining-reason-${applicationId}`}>
                  Reason
                </FieldLabel>
                <Textarea
                  id={`non-joining-reason-${applicationId}`}
                  name="reason"
                  required
                  rows={5}
                  placeholder="Record why the candidate did not join."
                />
              </Field>
              <DidNotJoinSubmitButton disabled={joiningDateIsFuture} />
            </form>
          </StandardDrawerContent>
        </Sheet>
      ) : null}
      {canCompleteAppointment ? (
        <CandidateAppointmentDialog
          applicationId={applicationId}
          candidateName={candidateName}
          defaultJoiningDate={defaultJoiningDate}
          panelId={panelId}
          returnJobId={returnJobId}
          trigger={
            <Button size="sm" type="button" variant="outline">
              <UserCheck data-icon="inline-start" />
              Appointment Details
            </Button>
          }
        />
      ) : null}

      {canWithdraw ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" type="button" variant="destructive">
              <UserX data-icon="inline-start" />
              Candidate Withdrew
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Record Candidate Withdrawal</SheetTitle>
              <SheetDescription>
                Close {candidateName}&apos;s Application For This Job And Keep
                The Reason In Conversation History.
              </SheetDescription>
            </SheetHeader>
            <form
              action={withdrawCandidateApplicationAction}
              className="grid gap-5 px-6 pb-6"
            >
              <input
                name="application_id"
                type="hidden"
                value={applicationId}
              />
              {panelId ? (
                <input name="panel" type="hidden" value={panelId} />
              ) : null}
              {returnJobId ? (
                <input name="return_job_id" type="hidden" value={returnJobId} />
              ) : null}
              <Field>
                <FieldLabel htmlFor={`withdrawal-reason-${applicationId}`}>
                  Reason
                </FieldLabel>
                <Textarea
                  id={`withdrawal-reason-${applicationId}`}
                  name="reason"
                  placeholder="Why does the candidate not want to continue?"
                  required
                  rows={5}
                />
              </Field>
              <Button type="submit" variant="destructive">
                Confirm Candidate Withdrawal
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
