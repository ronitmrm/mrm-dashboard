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
import {
  OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"

import { updateEmployeeProbationAction } from "@/app/hr/actions"
import { StandardDialogContent, StandardState } from "@/components/ui/golden-patterns"

function ProbationDateEditor({ assignment }: { assignment: RecruitmentEmployeeAssignmentRow }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">Update</Button>
      </DialogTrigger>
      <StandardDialogContent
        className="max-h-[90vh] overflow-y-auto"
        title={`Probation End Date · ${assignment.employeeName}`}
        description={`${assignment.postCode} · Employee ID ${assignment.employeeCode ?? "not recorded"}`}
      >
        <form action={updateEmployeeProbationAction} className="grid gap-4">
          <input name="panel" type="hidden" value="probationRemindersPanel" />
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
          <Button className="w-fit" type="submit">Save Date</Button>
        </form>
      </StandardDialogContent>
    </Dialog>
  )
}

export function ProbationEndReminders({
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
      <SectionCard>
        <CardHeader>
          <CardTitle>Probation End Reminders ({active.length})</CardTitle>
          <CardDescription>
            Review approaching probation end dates. The reminder is completed when the Appointment Letter is issued.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="hr-probation-end-reminders" containerClassName="max-h-[36rem] rounded-md border">
            <TableHeader><TableRow>
              <TableHead>Employee Code</TableHead><TableHead>Employee Name</TableHead><TableHead>Post</TableHead>
              <TableHead>Joined</TableHead><TableHead>Probation Ends</TableHead>
              <TableHead>Reminder</TableHead>
              {canManageEmployees ? <TableHead className="text-right">Action</TableHead> : null}
            </TableRow></TableHeader>
            <TableBody>
              {active.map((assignment) => {
                const reminderStatus = assignment.appointmentLetterIssuedOn
                  ? "Completed"
                  : !assignment.probationDueOn
                    ? "Date Needed"
                    : assignment.probationDueOn <= today ? "Due"
                      : assignment.probationDueOn <= approachingOn ? "Approaching" : "Scheduled"
                return <TableRow key={assignment.id}>
                  <TableCell className="font-mono">{assignment.employeeCode ?? "—"}</TableCell>
                  <TableCell className="font-medium">{assignment.employeeName}</TableCell>
                  <TableCell className="font-mono">{assignment.postCode}</TableCell>
                  <TableCell>{assignment.joinedOn ?? "Date needed"}</TableCell>
                  <TableCell>{assignment.probationDueOn ?? "Date needed"}</TableCell>
                  <TableCell><StatusBadge value={reminderStatus} tone={reminderStatus === "Completed" ? "positive" : reminderStatus === "Scheduled" ? "information" : "warning"} /></TableCell>
                  {canManageEmployees ? <TableCell className="text-right"><ProbationDateEditor assignment={assignment} /></TableCell> : null}
                </TableRow>
              })}
              {!active.length ? <TableRow><TableCell colSpan={canManageEmployees ? 7 : 6}>
                <StandardState title="No Probation Reminders" description="Joined employees appear here when their assignment is recorded." />
              </TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
  )
}

export function EmployeeAssignmentHistory({
  assignments,
}: {
  assignments: RecruitmentEmployeeAssignmentRow[]
}) {
  return (
      <SectionCard>
        <CardHeader>
          <CardTitle>Employee Assignment History</CardTitle>
          <CardDescription>Each joined employee remains recorded against the approved post after departure.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="hr-employee-assignment-history" containerClassName="max-h-[36rem] rounded-md border">
            <TableHeader><TableRow>
              <TableHead>Employee Code</TableHead><TableHead>Employee Name</TableHead><TableHead>Post</TableHead>
              <TableHead>Joined</TableHead><TableHead>Planned End</TableHead>
              <TableHead>Actual End</TableHead><TableHead>Exit</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assignments.map((assignment) => <TableRow key={assignment.id}>
                <TableCell className="font-mono">{assignment.employeeCode ?? "—"}</TableCell>
                <TableCell className="font-medium">{assignment.employeeName}</TableCell>
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
              {!assignments.length ? <TableRow><TableCell colSpan={7}>
                <StandardState title="No Assignment History" description="Joined employees will appear here." />
              </TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
  )
}
