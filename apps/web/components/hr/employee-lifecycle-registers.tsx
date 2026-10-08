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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"

import { updateEmployeeProbationAction } from "@/app/hr/actions"
import { probationReminderStatus, splitProbationAssignments } from "@/lib/hr/probation-reminder"
import { MetricSummary, StandardDialogContent, StandardState } from "@/components/ui/golden-patterns"

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
          <Field>
            <FieldLabel htmlFor={`probation-remark-${assignment.id}`}>Remark</FieldLabel>
            <Textarea
              id={`probation-remark-${assignment.id}`}
              maxLength={1000}
              name="remark"
              placeholder="Add a note about this update"
              rows={3}
            />
            <FieldDescription>Optional. Saved with this update in the audit history.</FieldDescription>
          </Field>
          {assignment.probationRemark ? <p className="text-sm text-muted-foreground">Latest remark: {assignment.probationRemark}</p> : null}
          <Button className="w-fit" type="submit">Save Update</Button>
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
  const { open, completed } = splitProbationAssignments(assignments, today, approachingOn)
  open.sort((left, right) =>
    (left.probationDueOn ?? "0000-01-01").localeCompare(right.probationDueOn ?? "0000-01-01")
  )
  completed.sort((left, right) =>
    (right.appointmentLetterIssuedOn ?? right.legacyProbationRecordedOn ?? "")
      .localeCompare(left.appointmentLetterIssuedOn ?? left.legacyProbationRecordedOn ?? "")
  )
  const due = open.filter((assignment) => assignment.probationDueOn && assignment.probationDueOn <= today).length
  const approachingCount = open.filter((assignment) =>
    assignment.probationDueOn && assignment.probationDueOn > today && assignment.probationDueOn <= approachingOn
  ).length
  const dateNeeded = open.filter((assignment) => !assignment.probationDueOn).length
  return (
    <>
      <MetricSummary
        scope="Probation assignment tasks and completion log · before table filters"
        items={[
          { label: "Open Tasks", value: open.length, tone: "information" },
          { label: "Due", value: due, tone: "warning" },
          { label: "Approaching", value: approachingCount, tone: "accent" },
          { label: "Date Needed", value: dateNeeded, tone: "warning" },
          { label: "Completed Log", value: completed.length, tone: "positive" },
        ]}
      />
      <Tabs className="min-w-0 gap-4" defaultValue="pending">
        <TabsList aria-label="Probation records">
          <TabsTrigger value="pending">Pending Tasks ({open.length})</TabsTrigger>
          <TabsTrigger value="completed">Completion Log ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent className="min-w-0" value="pending">
          <SectionCard>
            <CardHeader>
              <CardTitle>Pending Probation Tasks ({open.length})</CardTitle>
              <CardDescription>
                Review dates that need attention. Completed records move to the Completion Log tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <OperationalTable filterStorageKey="hr-probation-end-reminders" containerClassName="max-h-[36rem] rounded-md border">
                <TableHeader><TableRow>
                  <TableHead>Employee Code</TableHead><TableHead>Employee Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Department</TableHead><TableHead>Designation</TableHead>
                  <TableHead>Joined</TableHead><TableHead>Probation Ends</TableHead>
                  <TableHead>Reminder</TableHead><TableHead>Latest Remark</TableHead>
                  {canManageEmployees ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow></TableHeader>
                <TableBody>
                  {open.map((assignment) => {
                    const reminderStatus = probationReminderStatus(assignment, today, approachingOn)
                    return <TableRow key={assignment.id}>
                      <TableCell className="font-mono">{assignment.employeeCode ?? "—"}</TableCell>
                      <TableCell className="font-medium">{assignment.employeeName}</TableCell>
                      <TableCell className="whitespace-nowrap">{assignment.employeePhone ?? "—"}</TableCell>
                      <TableCell>{assignment.department ?? "—"}</TableCell>
                      <TableCell>{assignment.designation ?? "—"}</TableCell>
                      <TableCell>{assignment.joinedOn ?? "Date needed"}</TableCell>
                      <TableCell>{assignment.probationDueOn ?? "Date needed"}</TableCell>
                      <TableCell><StatusBadge value={reminderStatus} tone={reminderStatus === "Scheduled" ? "information" : "warning"} /></TableCell>
                      <TableCell>{assignment.probationRemark ?? "—"}</TableCell>
                      {canManageEmployees ? <TableCell className="text-right"><ProbationDateEditor assignment={assignment} /></TableCell> : null}
                    </TableRow>
                  })}
                  {!open.length ? <TableRow><TableCell colSpan={canManageEmployees ? 10 : 9}>
                    <StandardState title="No Open Probation Tasks" description="Joined assignments appear here until probation is completed or the employee leaves." />
                  </TableCell></TableRow> : null}
                </TableBody>
              </OperationalTable>
            </CardContent>
          </SectionCard>
        </TabsContent>
        <TabsContent className="min-w-0" value="completed">
          <SectionCard>
            <CardHeader>
              <CardTitle>Probation Completion Log ({completed.length})</CardTitle>
              <CardDescription>Issued Appointment Letters and recorded completions from the former system.</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <OperationalTable filterStorageKey="hr-probation-completion-log" containerClassName="max-h-[36rem] rounded-md border">
                <TableHeader><TableRow>
                  <TableHead>Employee Code</TableHead><TableHead>Employee Name</TableHead>
                  <TableHead>Department</TableHead><TableHead>Designation</TableHead>
                  <TableHead>Probation Ends</TableHead><TableHead>Recorded On</TableHead><TableHead>Completion Record</TableHead><TableHead>Latest Remark</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {completed.map((assignment) => <TableRow key={assignment.id}>
                    <TableCell className="font-mono">{assignment.employeeCode ?? "—"}</TableCell>
                    <TableCell className="font-medium">{assignment.employeeName}</TableCell>
                    <TableCell>{assignment.department ?? "—"}</TableCell>
                    <TableCell>{assignment.designation ?? "—"}</TableCell>
                    <TableCell>{assignment.probationDueOn ?? "—"}</TableCell>
                    <TableCell>{assignment.appointmentLetterIssuedOn ?? assignment.legacyProbationRecordedOn ?? "—"}</TableCell>
                    <TableCell><StatusBadge value={assignment.appointmentLetterIssuedOn ? "Appointment Letter" : "Legacy Completion"} tone="positive" /></TableCell>
                    <TableCell>{assignment.probationRemark ?? "—"}</TableCell>
                  </TableRow>)}
                  {!completed.length ? <TableRow><TableCell colSpan={8}>
                    <StandardState title="No Completed Probation Records" description="Completed assignments will be logged here." />
                  </TableCell></TableRow> : null}
                </TableBody>
              </OperationalTable>
            </CardContent>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  )
}

export function EmployeeAssignmentHistory({
  assignments,
}: {
  assignments: RecruitmentEmployeeAssignmentRow[]
}) {
  const departed = assignments.filter((assignment) => assignment.endedOn && assignment.exitType !== "Role Changed")
  const roleChanges = assignments.filter((assignment) => assignment.exitType === "Role Changed" && assignment.endedOn)
  return (
    <>
      <MetricSummary
        scope="Employee assignment records · before table filters"
        items={[
          { label: "Assignments", value: assignments.length, tone: "information" },
          { label: "Current", value: assignments.filter((assignment) => !assignment.endedOn).length, tone: "positive" },
          { label: "Planned Exits", value: assignments.filter((assignment) => assignment.plannedEndOn && !assignment.endedOn).length, tone: "warning" },
          { label: "Departed", value: departed.length, tone: "inactive" },
          { label: "Role Changes", value: roleChanges.length, tone: "information" },
          { label: "Left Without Process", value: departed.filter((assignment) => assignment.exitType === "Left Without Process").length, tone: "warning" },
        ]}
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>Employee Assignment History</CardTitle>
          <CardDescription>Joined assignments remain here after a role change or departure.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="hr-employee-assignment-history" containerClassName="max-h-[36rem] rounded-md border">
            <TableHeader><TableRow>
              <TableHead>Employee Code</TableHead><TableHead>Employee Name</TableHead>
              <TableHead>Department</TableHead><TableHead>Designation</TableHead>
              <TableHead>Joined</TableHead><TableHead>Planned End</TableHead>
              <TableHead>Actual End</TableHead><TableHead>Exit</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assignments.map((assignment) => {
                const exitStatus = assignment.endedOn
                  ? assignment.exitType ?? "Unspecified"
                  : assignment.exitType === "Resigned" ? "Resignation Planned" : "Current"
                return <TableRow key={assignment.id}>
                  <TableCell className="font-mono">{assignment.employeeCode ?? "—"}</TableCell>
                  <TableCell className="font-medium">{assignment.employeeName}</TableCell>
                  <TableCell>{assignment.department ?? "—"}</TableCell>
                  <TableCell>{assignment.designation ?? "—"}</TableCell>
                  <TableCell>{assignment.joinedOn ?? "Not recorded"}</TableCell>
                  <TableCell>{assignment.plannedEndOn ?? "—"}</TableCell>
                  <TableCell>{assignment.endedOn ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={exitStatus} tone={exitStatus === "Left Without Process" ? "warning" : exitStatus === "Resignation Planned" || exitStatus === "Role Changed" ? "information" : exitStatus === "Current" ? "positive" : "neutral"} />
                    {assignment.exitNote ? <span className="block text-xs text-muted-foreground">{assignment.exitNote}</span> : null}
                  </TableCell>
                </TableRow>})}
              {!assignments.length ? <TableRow><TableCell colSpan={8}>
                <StandardState title="No Assignment History" description="Joined employees will appear here." />
              </TableCell></TableRow> : null}
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
    </>
  )
}
