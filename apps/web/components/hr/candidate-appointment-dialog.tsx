"use client"

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
import type { ReactNode } from "react"

import { completeCandidateAppointmentAction } from "@/app/hr/actions"
import { CandidateAppointmentFields } from "@/components/hr/candidate-appointment-fields"

export function CandidateAppointmentDialog({
  applicationId,
  candidateName,
  defaultJoiningDate,
  onOpenChange,
  open,
  panelId,
  returnJobId,
  trigger,
}: {
  applicationId: string
  candidateName: string
  defaultJoiningDate: string | null
  onOpenChange?: (open: boolean) => void
  open?: boolean
  panelId?: string
  returnJobId?: string
  trigger?: ReactNode
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complete Appointment Details</DialogTitle>
          <DialogDescription>
            {candidateName}&apos;s HR Round Is Approved. Confirm Willingness And
            Joining Terms To Complete The Appointment.
          </DialogDescription>
        </DialogHeader>
        <form
          action={completeCandidateAppointmentAction}
          className="grid gap-5"
        >
          <input name="application_id" type="hidden" value={applicationId} />
          {panelId ? (
            <input name="panel" type="hidden" value={panelId} />
          ) : null}
          {returnJobId ? (
            <input name="return_job_id" type="hidden" value={returnJobId} />
          ) : null}
          <CandidateAppointmentFields
            defaultJoiningDate={defaultJoiningDate ?? ""}
          />
          <DialogFooter>
            <Button type="submit">Save Appointment Details</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
