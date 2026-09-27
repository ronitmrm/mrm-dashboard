"use client"

import type { RecruitmentEmployeeAssignmentRow } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent, CardDescription, CardHeader, CardTitle, SectionCard,
} from "@workspace/ui/components/card"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import {
  OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"

import { updateEmployeeFollowupAction } from "@/app/hr/actions"
import { StandardDialogContent, StandardState } from "@/components/ui/golden-patterns"

function FollowupEditor({ assignment }: { assignment: RecruitmentEmployeeAssignmentRow }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">Update</Button>
      </DialogTrigger>
      <StandardDialogContent
        className="max-h-[90vh] overflow-y-auto"
        title={`HR Follow-up · ${assignment.employeeName}`}
        description={`${assignment.postCode} · Employee ID ${assignment.employeeCode ?? "not recorded"}`}
      >
        <form action={updateEmployeeFollowupAction} className="grid gap-4">
          <input name="panel" type="hidden" value="employeeMasterPanel" />
          <input name="assignment_id" type="hidden" value={assignment.id} />
          <Field>
            <FieldLabel htmlFor={`probation-${assignment.id}`}>Probation Ends On</FieldLabel>
            <Input
              defaultValue={assignment.probationDueOn ?? ""}
              id={`probation-${assignment.id}`}
              name="probation_due_on"
              type="date"
            />
            <FieldDescription>Set this date if it was unavailable at joining.</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`pf-status-${assignment.id}`}>PF Enrolment</FieldLabel>
              <NativeSelect defaultValue={assignment.pfStatus} id={`pf-status-${assignment.id}`} name="pf_status">
                <NativeSelectOption value="Pending">Pending</NativeSelectOption>
                <NativeSelectOption value="Completed">Completed</NativeSelectOption>
                <NativeSelectOption value="Not Applicable">Not Applicable</NativeSelectOption>
                <NativeSelectOption value="Unknown">Unknown</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`pf-date-${assignment.id}`}>PF Completed On</FieldLabel>
              <Input defaultValue={assignment.pfCompletedOn ?? ""} id={`pf-date-${assignment.id}`} name="pf_completed_on" type="date" />
            </Field>
            <Field>
              <FieldLabel htmlFor={`uniform-status-${assignment.id}`}>Uniform Issue</FieldLabel>
              <NativeSelect defaultValue={assignment.uniformStatus} id={`uniform-status-${assignment.id}`} name="uniform_status">
                <NativeSelectOption value="Pending">Pending</NativeSelectOption>
                <NativeSelectOption value="Completed">Completed</NativeSelectOption>
                <NativeSelectOption value="Not Applicable">Not Applicable</NativeSelectOption>
                <NativeSelectOption value="Unknown">Unknown</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`uniform-date-${assignment.id}`}>Uniform Issued On</FieldLabel>
              <Input defaultValue={assignment.uniformCompletedOn ?? ""} id={`uniform-date-${assignment.id}`} name="uniform_completed_on" type="date" />
            </Field>
          </div>
          <Button className="w-fit" type="submit">Save Follow-up</Button>
        </form>
      </StandardDialogContent>
    </Dialog>
  )
}

export function EmployeeLifecycleRegisters({
  assignments,
  canManageEmployees,
}: {
  assignments: RecruitmentEmployeeAssignmentRow[]
  canManageEmployees: boolean
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date())
  const approaching = new Date(`${today}T00:00:00Z`)
  approaching.setUTCDate(approaching.getUTCDate() + 30)
  const approachingOn = approaching.toISOString().slice(0, 10)
  const active = assignments.filter(
    (assignment) => !assignment.endedOn || assignment.endedOn >= today
  ).sort((left, right) => {
    const priority = (assignment: RecruitmentEmployeeAssignmentRow) =>
      assignment.appointmentLetterIssuedOn ? "9999-12-31" : assignment.probationDueOn ?? "0000-01-01"
    return priority(left).localeCompare(priority(right))
  })
  return (
    <>
      <SectionCard>
        <CardHeader>
          <CardTitle>HR Follow-up ({active.length})</CardTitle>
          <CardDescription>
            Review probation and issue the Appointment Letter from Employee Master.
            Record PF enrolment and uniform issue here. PF eligibility is checked from joining.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="hr-employee-followup" containerClassName="max-h-[36rem] rounded-md border">
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead>Post</TableHead>
              <TableHead>Joined</TableHead><TableHead>Probation Ends</TableHead>
              <TableHead>Appointment Letter</TableHead><TableHead>PF</TableHead>
              <TableHead>Uniform</TableHead>{canManageEmployees ? <TableHead className="text-right">Action</TableHead> : null}
            </TableRow></TableHeader>
            <TableBody>
              {active.map((assignment) => {
                const letterStatus = assignment.appointmentLetterIssuedOn
                  ? "Issued"
                  : !assignment.probationDueOn
                    ? "Date Needed"
                    : assignment.probationDueOn <= today ? "Due"
                      : assignment.probationDueOn <= approachingOn ? "Approaching" : "Scheduled"
                return <TableRow key={assignment.id}>
                  <TableCell>
                    <span className="font-medium">{assignment.employeeName}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{assignment.employeeCode ?? "No ID"}</span>
                  </TableCell>
                  <TableCell className="font-mono">{assignment.postCode}</TableCell>
                  <TableCell>{assignment.joinedOn ?? "Date needed"}</TableCell>
                  <TableCell>{assignment.probationDueOn ?? "Date needed"}</TableCell>
                  <TableCell><StatusBadge value={letterStatus} tone={letterStatus === "Issued" ? "positive" : letterStatus === "Scheduled" ? "information" : "warning"} /></TableCell>
                  <TableCell><StatusBadge value={assignment.pfStatus} tone={assignment.pfStatus === "Completed" ? "positive" : assignment.pfStatus === "Pending" ? "warning" : "neutral"} /></TableCell>
                  <TableCell><StatusBadge value={assignment.uniformStatus} tone={assignment.uniformStatus === "Completed" ? "positive" : assignment.uniformStatus === "Pending" ? "warning" : "neutral"} /></TableCell>
                  {canManageEmployees ? <TableCell className="text-right"><FollowupEditor assignment={assignment} /></TableCell> : null}
                </TableRow>
              })}
              {!active.length ? <TableRow><TableCell colSpan={canManageEmployees ? 8 : 7}>
                <StandardState title="No Employee Follow-ups" description="Joined employees appear here when their assignment is recorded." />
              </TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
      <SectionCard>
        <CardHeader>
          <CardTitle>Employee Assignment History</CardTitle>
          <CardDescription>Each joined employee remains recorded against the approved post after departure.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="hr-employee-assignment-history" containerClassName="max-h-[36rem] rounded-md border">
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead>Post</TableHead>
              <TableHead>Joined</TableHead><TableHead>Planned End</TableHead>
              <TableHead>Actual End</TableHead><TableHead>Exit</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assignments.map((assignment) => <TableRow key={assignment.id}>
                <TableCell>
                  <span className="font-medium">{assignment.employeeName}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{assignment.employeeCode ?? "No ID"}</span>
                </TableCell>
                <TableCell className="font-mono">{assignment.postCode}</TableCell>
                <TableCell>{assignment.joinedOn ?? "Not recorded"}</TableCell>
                <TableCell>{assignment.plannedEndOn ?? "—"}</TableCell>
                <TableCell>{assignment.endedOn ?? "—"}</TableCell>
                <TableCell>
                  {assignment.exitType
                    ? <><StatusBadge value={assignment.exitType} tone={assignment.exitType === "Left Without Process" ? "warning" : "neutral"} />
                      {assignment.exitNote ? <span className="block text-xs text-muted-foreground">{assignment.exitNote}</span> : null}</>
                    : <StatusBadge value="Current" tone="positive" />}
                </TableCell>
              </TableRow>)}
              {!assignments.length ? <TableRow><TableCell colSpan={6}>
                <StandardState title="No Assignment History" description="Joined employees will appear here." />
              </TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </>
  )
}
