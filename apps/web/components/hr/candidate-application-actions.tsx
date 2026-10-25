"use client"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
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
import { Pencil, UserCheck, UserX } from "lucide-react"

import {
  withdrawCandidateApplicationAction,
  recordCandidateDidNotJoinAction,
  reviseCandidateAppointmentAction,
  reappointCandidateAppointmentAction,
} from "@/app/hr/actions"
import {
  CandidateAppointmentFields,
  type CandidateAppointmentDefaults,
} from "@/components/hr/candidate-appointment-fields"
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

function AppointmentSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  )
}

export function CandidateApplicationActions({
  applicationId,
  candidateName,
  canCompleteAppointment,
  canRecordDidNotJoin = false,
  canReappoint = false,
  canWithdraw,
  defaultJoiningDate,
  appointmentDefaults,
  didNotJoinOn,
  didNotJoinReason,
  masterView,
  panelId,
  returnJobId,
}: {
  applicationId: string
  candidateName: string
  canCompleteAppointment: boolean
  canRecordDidNotJoin?: boolean
  canReappoint?: boolean
  canWithdraw: boolean
  defaultJoiningDate: string | null
  appointmentDefaults?: CandidateAppointmentDefaults
  didNotJoinOn?: string | null
  didNotJoinReason?: string | null
  masterView?: "dataEntry" | "masterTables"
  panelId?: string
  returnJobId?: string
}) {
  const today = istDateValue(new Date())
  const minimumRejoiningDate = didNotJoinOn === today
    ? istDateValue(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000) : today
  const joiningDateIsFuture = Boolean(
    defaultJoiningDate && defaultJoiningDate > today
  )
  if (!canCompleteAppointment && !canWithdraw && !canRecordDidNotJoin && !canReappoint)
    return null

  return (
    <div className="flex justify-end gap-2">
      {(canReappoint || canRecordDidNotJoin && appointmentDefaults?.offer) && appointmentDefaults ? (
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <Pencil data-icon="inline-start" />
              {canReappoint ? "Reappoint Candidate" : "Edit Appointment & Offer"}
            </Button>
          </SheetTrigger>
          <StandardDrawerContent
            className="w-full overflow-y-auto sm:max-w-2xl"
            title={canReappoint ? "Reappoint Candidate With New Joining Date" : "Edit Appointment & Offer"}
            description={canReappoint
              ? `Reappoint ${candidateName} to the same job. Earlier interviews, non-joining and offers remain in candidate history.${appointmentDefaults.offer ? " Saving generates an updated offer." : ""}`
              : `Correct ${candidateName}'s appointment terms. Saving creates an updated PDF and keeps earlier offers in history.`}
          >
            <form
              action={canReappoint ? reappointCandidateAppointmentAction : reviseCandidateAppointmentAction}
              className="px-6 pb-6"
            >
              <input
                name="application_id"
                type="hidden"
                value={applicationId}
              />
              <input
                name="previous_joining_date"
                type="hidden"
                value={defaultJoiningDate ?? ""}
              />
              {returnJobId ? (
                <input name="return_job_id" type="hidden" value={returnJobId} />
              ) : null}
              {panelId ? (
                <input name="panel" type="hidden" value={panelId} />
              ) : null}
              <FieldGroup>
                <input
                  name="previous_letter_id"
                  type="hidden"
                  value={appointmentDefaults.offer?.id ?? ""}
                />
                {canReappoint && didNotJoinOn ? (
                  <p className="text-sm text-muted-foreground">
                    Earlier Did Not Join: {formatIstDate(didNotJoinOn)}{didNotJoinReason ? ` · ${didNotJoinReason}` : ""}
                  </p>
                ) : null}
                <CandidateAppointmentFields
                  defaultJoiningDate={canReappoint ? "" : defaultJoiningDate ?? ""}
                  defaults={canReappoint && appointmentDefaults.offer
                    ? { ...appointmentDefaults, offer: { ...appointmentDefaults.offer, issuedOn: today } }
                    : appointmentDefaults}
                  includeOfferDetails={!canReappoint || Boolean(appointmentDefaults.offer)}
                  minimumJoiningDate={canReappoint ? minimumRejoiningDate : undefined}
                />
                <Field>
                  <FieldLabel htmlFor={`joining-reason-${applicationId}`}>
                    {canReappoint ? "Reason for Reappointment" : "Reason for Correction"}
                  </FieldLabel>
                  <Textarea
                    id={`joining-reason-${applicationId}`}
                    name="reason"
                    required
                    rows={3}
                  />
                </Field>
                <AppointmentSubmitButton label={canReappoint
                  ? appointmentDefaults.offer ? "Reappoint And Generate Updated Offer" : "Confirm Reappointment"
                  : "Save And Generate Updated PDF"} />
              </FieldGroup>
            </form>
          </StandardDrawerContent>
        </Sheet>
      ) : null}
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
              {masterView ? (
                <>
                  <input name="master_view" type="hidden" value={masterView} />
                  <input name="master_kind" type="hidden" value="employee-assignment" />
                </>
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
