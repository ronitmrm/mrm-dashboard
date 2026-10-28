"use client"

import { useState } from "react"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"

import type { RecruitmentEmployeeAssignmentRow, RecruitmentEmploymentLetterRow, RecruitmentPostRow } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CardContent, CardDescription, CardHeader, CardTitle, SectionCard,
} from "@workspace/ui/components/card"
import { Dialog, DialogTrigger } from "@workspace/ui/components/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { useRouter } from "next/navigation"

import { updateEmployeeProbationAction } from "@/app/hr/actions"
import { AttachmentViewerLink } from "@/components/attachment-viewer-link"
import { EmployeeLetterForm } from "@/components/hr/employee-letter-dialog"
import { EmployeeAppointmentLetters } from "@/components/hr/employee-appointment-letters"
import { formatIstDateTime } from "@/lib/date-time"
import { probationReminderStatus, splitProbationAssignments } from "@/lib/hr/probation-reminder"
import { MetricSummary, StandardDialogContent, StandardState } from "@/components/ui/golden-patterns"

function currentEmployeePost(assignment: RecruitmentEmployeeAssignmentRow, posts: RecruitmentPostRow[]) {
  return posts.find((post) => post.status === "Occupied" &&
    post.postCode === assignment.postCode && assignment.employeeCode &&
    post.employeeCode === assignment.employeeCode)
}

function ProbationDateEditor({ assignment, canGenerateAppointment }: {
  assignment: RecruitmentEmployeeAssignmentRow
  canGenerateAppointment: boolean
}) {
  const [extending, setExtending] = useState(false)
  return (
    <Dialog onOpenChange={() => setExtending(false)}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">Update</Button>
      </DialogTrigger>
      <StandardDialogContent
        className="max-h-[90vh] overflow-y-auto"
        title={`Probation Review · ${assignment.employeeName}`}
        description={`${assignment.postCode} · Employee ID ${assignment.employeeCode ?? "not recorded"}`}
      >
        <form action={updateEmployeeProbationAction}>
          <FieldGroup>
            <input name="panel" type="hidden" value="probationRemindersPanel" />
            <input name="assignment_id" type="hidden" value={assignment.id} />
            <Field>
              {extending ? <FieldDescription>Current probation ends on {formatCalendarDate(assignment.probationDueOn ?? "Date needed")}.</FieldDescription> : null}
              <FieldLabel htmlFor={`probation-${assignment.id}`}>
                {extending ? "Next Probation End Date" : "Probation Ends On"}
              </FieldLabel>
              <Input
                defaultValue={extending ? "" : assignment.probationDueOn ?? ""}
                id={`probation-${assignment.id}`}
                key={String(extending)}
                min={extending ? assignment.probationDueOn ?? undefined : undefined}
                name="probation_due_on"
                required={extending}
                type="date"
              />
              <FieldDescription>{extending
                ? "Choose a later end date for the next probation review."
                : "Set this date if it was unavailable at joining."}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`probation-remark-${assignment.id}`}>{extending ? "Review Comment" : "Remark"}</FieldLabel>
              <Textarea
                id={`probation-remark-${assignment.id}`}
                maxLength={1000}
                name="remark"
                placeholder="Add a note about this update"
                required={extending}
                rows={3}
              />
              <FieldDescription>{extending
                ? "Required. The extension, both dates and this comment appear in Employee Assignment History."
                : "Optional. Saved with this update in the audit history."}</FieldDescription>
            </Field>
            {assignment.probationRemark ? <p className="text-sm text-muted-foreground">Latest remark: {assignment.probationRemark}</p> : null}
            <div className="flex flex-wrap gap-2">
              {extending ? (
                <>
                  <Button name="next_step" type="submit" value="extend">Save Extension</Button>
                  <Button onClick={() => setExtending(false)} type="button" variant="outline">Back</Button>
                </>
              ) : (
                <>
                  <Button type="submit">Save Update</Button>
                  {canGenerateAppointment ? (
                    <>
                      <Button name="next_step" type="submit" value="appointment" variant="outline">
                        Save & Generate Appointment Letter
                      </Button>
                      <Button disabled={!assignment.probationDueOn} onClick={() => setExtending(true)} type="button" variant="outline">
                        Extend Probation
                      </Button>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </FieldGroup>
        </form>
      </StandardDialogContent>
    </Dialog>
  )
}

export function ProbationEndReminders({
  assignments,
  posts,
  canManageEmployees,
  canViewOfferLetters,
  appointmentAssignmentId,
  employmentLetters,
}: {
  assignments: RecruitmentEmployeeAssignmentRow[]
  posts: RecruitmentPostRow[]
  canManageEmployees: boolean
  canViewOfferLetters: boolean
  appointmentAssignmentId?: string
  employmentLetters: RecruitmentEmploymentLetterRow[]
}) {
  const router = useRouter()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date())
  const approaching = new Date(`${today}T00:00:00Z`)
  approaching.setUTCDate(approaching.getUTCDate() + 30)
  const approachingOn = approaching.toISOString().slice(0, 10)
  const { open, completed } = splitProbationAssignments(assignments, today, approachingOn)
  const appointmentAssignment = canManageEmployees
    ? open.find((assignment) => assignment.id === appointmentAssignmentId)
    : undefined
  const appointmentPost = appointmentAssignment
    ? currentEmployeePost(appointmentAssignment, posts)
    : undefined
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
      {appointmentAssignment && appointmentPost ? (
        <Dialog
          defaultOpen
          key={appointmentAssignment.id}
          onOpenChange={(isOpen) => {
            if (!isOpen) router.replace("/hr?panel=probationRemindersPanel", { scroll: false })
          }}
        >
          <StandardDialogContent
            className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
            title="Generate Appointment Letter"
            description={`${appointmentAssignment.employeeName} · Employee ID ${appointmentAssignment.employeeCode} · ${appointmentAssignment.designation}`}
          >
            <EmployeeLetterForm
              post={appointmentPost}
              probationCompletedOn={appointmentAssignment.probationDueOn}
              returnPanel="probationRemindersPanel"
              type="appointment"
            />
          </StandardDialogContent>
        </Dialog>
      ) : null}
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
                  <TableHead>Offer Letter</TableHead>
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
                      <TableCell data-filter-value={canViewOfferLetters ? assignment.offerLetterReference ?? "—" : "—"}>
                        {canViewOfferLetters && assignment.offerLetterId ? (
                          <Button asChild size="sm" variant="outline">
                            <AttachmentViewerLink
                              fileName={`${assignment.offerLetterReference}-offer-letter.pdf`}
                              href={`/hr/employment-letters/${assignment.offerLetterId}/download`}
                              mediaType="application/pdf"
                            >{assignment.offerLetterReference ?? "View Offer Letter"}</AttachmentViewerLink>
                          </Button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{assignment.department ?? "—"}</TableCell>
                      <TableCell>{assignment.designation ?? "—"}</TableCell>
                      <TableCell>{formatCalendarDate(assignment.joinedOn ?? "Date needed")}</TableCell>
                      <TableCell>{formatCalendarDate(assignment.probationDueOn ?? "Date needed")}</TableCell>
                      <TableCell><StatusBadge value={reminderStatus} tone={reminderStatus === "Scheduled" ? "information" : "warning"} /></TableCell>
                      <TableCell>{assignment.probationRemark ?? "—"}</TableCell>
                      {canManageEmployees ? <TableCell className="text-right"><ProbationDateEditor assignment={assignment} canGenerateAppointment={Boolean(currentEmployeePost(assignment, posts))} /></TableCell> : null}
                    </TableRow>
                  })}
                  {!open.length ? <TableRow><TableCell colSpan={canManageEmployees ? 11 : 10}>
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
                  {canViewOfferLetters || canManageEmployees ? <TableHead>Appointment Letter</TableHead> : null}
                </TableRow></TableHeader>
                <TableBody>
                  {completed.map((assignment) => <TableRow key={assignment.id}>
                    <TableCell className="font-mono">{assignment.employeeCode ?? "—"}</TableCell>
                    <TableCell className="font-medium">{assignment.employeeName}</TableCell>
                    <TableCell>{assignment.department ?? "—"}</TableCell>
                    <TableCell>{assignment.designation ?? "—"}</TableCell>
                    <TableCell>{formatCalendarDate(assignment.probationDueOn ?? "—")}</TableCell>
                    <TableCell>{formatCalendarDate(assignment.appointmentLetterIssuedOn ?? assignment.legacyProbationRecordedOn ?? "—")}</TableCell>
                    <TableCell><StatusBadge value={assignment.appointmentLetterIssuedOn ? "Appointment Letter" : "Legacy Completion"} tone="positive" /></TableCell>
                    <TableCell>{assignment.probationRemark ?? "—"}</TableCell>
                    {canViewOfferLetters || canManageEmployees ? (
                      <TableCell>
                        <EmployeeAppointmentLetters
                          canEdit={canManageEmployees}
                          employeeCode={assignment.employeeCode}
                          emptyLabel="—"
                          joiningDate={assignment.joinedOn}
                          letters={employmentLetters}
                          returnPanel="probationRemindersPanel"
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>)}
                  {!completed.length ? <TableRow><TableCell colSpan={canViewOfferLetters || canManageEmployees ? 9 : 8}>
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
  const rows = assignments.flatMap((assignment) => [
    {
      id: assignment.id, assignment,
      status: assignment.endedOn
        ? assignment.exitType ?? "Unspecified"
        : assignment.exitType === "Resigned" ? "Resignation Planned" : "Current",
      plannedEndOn: assignment.plannedEndOn, endedOn: assignment.endedOn,
      recordedAt: null, note: assignment.exitNote,
      probationChange: null,
    },
    ...(assignment.resignationHistory ?? []).map((event, index) => ({
      id: `${assignment.id}:resignation:${index}`, assignment,
      status: event.type === "Resignation Withdrawn" ? "Resignation Cancelled" : event.type,
      plannedEndOn: event.lastWorkingDate, endedOn: null,
      recordedAt: event.recordedAt, note: event.note,
      probationChange: null,
    })),
    ...(assignment.probationHistory ?? []).map((event, index) => ({
      id: `${assignment.id}:probation:${index}`, assignment,
      status: "Probation Extended", plannedEndOn: null, endedOn: null,
      recordedAt: event.recordedAt, note: event.note,
      probationChange: event,
    })),
  ])
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
          <CardDescription>Assignments, resignations, cancelled resignations and probation extensions appear as separate rows. Summary counts reflect assignments.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <OperationalTable filterStorageKey="hr-employee-assignment-history" containerClassName="max-h-[36rem] rounded-md border">
            <TableHeader><TableRow>
              <TableHead>Employee Code</TableHead><TableHead>Employee Name</TableHead>
              <TableHead>Department</TableHead><TableHead>Designation</TableHead>
              <TableHead>Joined</TableHead><TableHead>Planned End</TableHead>
              <TableHead>Actual End</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => {
                const { assignment, status } = row
                return <TableRow key={row.id}>
                  <TableCell className="font-mono">{assignment.employeeCode ?? "—"}</TableCell>
                  <TableCell className="font-medium">{assignment.employeeName}</TableCell>
                  <TableCell>{assignment.department ?? "—"}</TableCell>
                  <TableCell>{assignment.designation ?? "—"}</TableCell>
                  <TableCell>{formatCalendarDate(assignment.joinedOn ?? "Not recorded")}</TableCell>
                  <TableCell>{formatCalendarDate(row.plannedEndOn ?? "—")}</TableCell>
                  <TableCell>{formatCalendarDate(row.endedOn ?? "—")}</TableCell>
                  <TableCell data-filter-value={status}>
                    <StatusBadge value={status} tone={status === "Left Without Process" ? "warning" : status === "Resignation Planned" || status === "Resigned" || status === "Role Changed" || status === "Probation Extended" ? "information" : status === "Current" || status === "Resignation Cancelled" ? "positive" : "neutral"} />
                    {row.probationChange ? <span className="block text-xs text-muted-foreground">Probation: {formatCalendarDate(row.probationChange.previousDueOn ?? "Not recorded")} → {formatCalendarDate(row.probationChange.nextDueOn)}</span> : null}
                    {row.recordedAt ? <span className="block text-xs text-muted-foreground">{formatIstDateTime(row.recordedAt)} IST</span> : null}
                    {row.note ? <span className="block text-xs text-muted-foreground">{row.note}</span> : null}
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
