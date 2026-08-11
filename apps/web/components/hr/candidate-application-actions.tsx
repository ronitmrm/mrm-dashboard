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
import { UserCheck, UserX } from "lucide-react"

import {
  completeCandidateAppointmentAction,
  withdrawCandidateApplicationAction,
} from "@/app/hr/actions"
import { CandidateAppointmentFields } from "@/components/hr/candidate-appointment-fields"

export function CandidateApplicationActions({
  applicationId,
  candidateName,
  canCompleteAppointment,
  canWithdraw,
  defaultJoiningDate,
  returnJobId,
}: {
  applicationId: string
  candidateName: string
  canCompleteAppointment: boolean
  canWithdraw: boolean
  defaultJoiningDate: string | null
  returnJobId: string
}) {
  if (!canCompleteAppointment && !canWithdraw) return null

  return (
    <div className="flex justify-end gap-2">
      {canCompleteAppointment ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <UserCheck data-icon="inline-start" />
              Appointment Details
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Complete Appointment Details</SheetTitle>
              <SheetDescription>
                {candidateName} Has All Three Rounds Approved. Confirm The
                Joining Terms To Complete The Appointment.
              </SheetDescription>
            </SheetHeader>
            <form
              action={completeCandidateAppointmentAction}
              className="grid gap-5 px-6 pb-6"
            >
              <input
                name="application_id"
                type="hidden"
                value={applicationId}
              />
              <input name="return_job_id" type="hidden" value={returnJobId} />
              <CandidateAppointmentFields
                defaultJoiningDate={defaultJoiningDate ?? ""}
              />
              <Button type="submit">Save Appointment Details</Button>
            </form>
          </SheetContent>
        </Sheet>
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
              <input name="return_job_id" type="hidden" value={returnJobId} />
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
