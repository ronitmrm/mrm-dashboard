"use client"

import { formatIstDateTime } from "../../lib/date-time"

import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentEmployeeAssignmentRow,
  RecruitmentPostRow,
} from "@workspace/db"
import { resolveRecruitmentEmployeeAssignmentTarget } from "@workspace/db/recruitment-domain"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { useMemo, useState } from "react"
import { EmployeeResignationHistory } from "./employee-resignation-history"
import { employeeAssignmentForPost } from "@/lib/employee-handover-rows"

type AssignmentTarget = {
  combinedRole: RecruitmentCombinedRoleRow | null
  post: RecruitmentPostRow
}

function resignedAssignment(
  post: RecruitmentPostRow | undefined,
  assignments: RecruitmentEmployeeAssignmentRow[]
) {
  return post?.status === "Resigned" ? assignments.find((assignment) =>
    assignment.postCode === post.postCode && assignment.endedOn === null &&
    (!post.employeeCode || assignment.employeeCode === post.employeeCode)
  ) : undefined
}

function initialEmploymentEvent(
  status?: string,
  allowIdentityCorrection = false
) {
  if (status === "Appointed") {
    return allowIdentityCorrection ? "Appointed" : ""
  }
  if (status === "Resigned") return "Resigned"
  if (status === "Occupied") {
    return allowIdentityCorrection ? "Joined" : ""
  }
  return "Appointed"
}

export function SingleEmployeeAssignmentFields({
  allowIdentityCorrection = false,
  combinedRoles,
  employeeAssignments = [],
  initialPostId = "",
  posts,
  showTargetSelector = true,
}: {
  allowIdentityCorrection?: boolean
  combinedRoles: RecruitmentCombinedRoleRow[]
  employeeAssignments?: RecruitmentEmployeeAssignmentRow[]
  initialPostId?: string
  posts: RecruitmentPostRow[]
  showTargetSelector?: boolean
}) {
  const { combinedTargets, individualTargets, targets } = useMemo(() => {
    const activeCombinedRoles = combinedRoles.filter(
      (role) => role.status === "Active"
    )
    const postByCode = new Map(posts.map((post) => [post.postCode, post]))
    const combined: AssignmentTarget[] = activeCombinedRoles.flatMap(
      (combinedRole) => {
        const post = postByCode.get(
          combinedRole.primaryPostCode ?? combinedRole.postCodes[0] ?? ""
        )
        return post ? [{ combinedRole, post }] : []
      }
    )
    const combinedPostCodes = new Set(
      combined.flatMap(({ combinedRole }) => combinedRole?.postCodes ?? [])
    )
    const individual: AssignmentTarget[] = posts
      .filter(
        (post) =>
          post.status !== "Inactive" && !combinedPostCodes.has(post.postCode)
      )
      .map((post) => ({ combinedRole: null, post }))
    return {
      combinedTargets: combined,
      individualTargets: individual,
      targets: [...combined, ...individual],
    }
  }, [combinedRoles, posts])
  const requestedInitialPost = resolveRecruitmentEmployeeAssignmentTarget(
    posts,
    initialPostId
  )
  const initialTarget = targets.find(
    ({ post }) => post.id === requestedInitialPost?.id
  )
  const [postId, setPostId] = useState(initialTarget?.post.id ?? "")
  const initialAssignment = resignedAssignment(initialTarget?.post, employeeAssignments)
  const [employeeName, setEmployeeName] = useState(
    initialTarget?.post.employeeName ?? initialAssignment?.employeeName ?? ""
  )
  const [employeeCode, setEmployeeCode] = useState(
    initialTarget?.post.employeeCode ?? initialAssignment?.employeeCode ?? ""
  )
  const [event, setEvent] = useState(
    initialEmploymentEvent(initialTarget?.post.status, allowIdentityCorrection)
  )
  const selected = targets.find(({ post }) => post.id === postId)
  const selectedAssignment = selected
    ? employeeAssignmentForPost(selected.post, employeeAssignments) ??
      resignedAssignment(selected.post, employeeAssignments) : undefined
  const assigned = Boolean(
    selected?.post.employeeName || selected?.post.employeeCode || selectedAssignment
  )
  const appointed = selected?.post.status === "Appointed"
  const pendingReplacement = selected?.post.replacementAppointments?.find(
    (appointment) => appointment.status === "Pending"
  )
  const canWithdrawResignation = allowIdentityCorrection &&
    selected?.post.status === "Resigned" && Boolean(selectedAssignment && !selectedAssignment.endedOn)
  const appointingReplacement =
    selected?.post.status === "Resigned" && event === "Appointed"
  const managingReplacement =
    event === "Replacement Joined" || event === "Cancel Replacement"
  const awaitingJoiningConfirmation = Boolean(
    appointed && selected?.post.joiningConfirmationDue
  )
  const canCorrectIdentity = Boolean(
    allowIdentityCorrection &&
    assigned &&
    (event === "Appointed" || event === "Joined") &&
    (selected?.post.status === "Appointed" ||
      selected?.post.status === "Occupied")
  )
  const employeeIdentityLocked = assigned &&
    !["Appointed", "Joined", "Replacement Joined"].includes(event)
  const candidateAppointment = Boolean(appointed && selected.post.appointedApplicationId)
  const canChangeRole = Boolean(
    selected?.post.status === "Occupied" &&
    !selected.combinedRole &&
    selected.post.employeeCode &&
    posts.some((post) =>
      post.id !== selected?.post.id &&
      post.status === "Occupied" &&
      post.employeeCode === selected?.post.employeeCode
    )
  )
  const canCorrectDesignation = Boolean(selected?.post.status === "Occupied" &&
    !selected.post.combinedRoleId && selected.post.employeeCode && selectedAssignment && !pendingReplacement)
  const designationTargets = individualTargets.filter(({ post }) =>
    post.id !== postId && post.status === "Vacant" && !post.combinedRoleId &&
    post.departmentCode === selected?.post.departmentCode &&
    post.designation !== selected?.post.designation &&
    !post.replacementAppointments?.some((appointment) => appointment.status === "Pending")
  )

  function selectTarget(nextPostId: string) {
    const next = targets.find(({ post }) => post.id === nextPostId)
    const assignment = resignedAssignment(next?.post, employeeAssignments)
    setPostId(nextPostId)
    setEmployeeName(next?.post.employeeName ?? assignment?.employeeName ?? "")
    setEmployeeCode(next?.post.employeeCode ?? assignment?.employeeCode ?? "")
    setEvent(initialEmploymentEvent(next?.post.status, allowIdentityCorrection))
  }

  function selectEvent(nextEvent: string) {
    setEvent(nextEvent)
    if (nextEvent === "Appointed" && selected?.post.status === "Resigned") {
      setEmployeeName("")
      setEmployeeCode("")
    } else if (
      nextEvent === "Replacement Joined" ||
      nextEvent === "Cancel Replacement"
    ) {
      setEmployeeName(pendingReplacement?.employeeName ?? "")
      setEmployeeCode(pendingReplacement?.employeeCode ?? "")
    } else {
      setEmployeeName(selected?.post.employeeName ?? selectedAssignment?.employeeName ?? "")
      setEmployeeCode(selected?.post.employeeCode ?? selectedAssignment?.employeeCode ?? "")
    }
  }

  return (
    <>
      {showTargetSelector ? (
        <Field className="w-full min-w-0">
          <FieldLabel htmlFor="employee-post">
            Approved Post Or Combined Job
          </FieldLabel>
          <NativeSelect
            className="w-full"
            id="employee-post"
            name="post_id"
            onChange={(change) => selectTarget(change.target.value)}
            required
            value={postId}
          >
            <NativeSelectOption value="">
              Select Post Or Combined Job
            </NativeSelectOption>
            {combinedTargets.length ? (
              <NativeSelectOptGroup label="Combined Jobs">
                {combinedTargets.map(({ combinedRole, post }) => (
                  <NativeSelectOption key={combinedRole!.id} value={post.id}>
                    {combinedRole!.vacancyCode} · {combinedRole!.name} ·
                    Includes {combinedRole!.postCodes.join(", ")}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ) : null}
            {individualTargets.length ? (
              <NativeSelectOptGroup label="Individual Approved Posts">
                {individualTargets.map(({ post }) => (
                  <NativeSelectOption key={post.id} value={post.id}>
                    {post.postCode} · {post.designation} · {post.status}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ) : null}
          </NativeSelect>
        </Field>
      ) : (
        <input name="post_id" type="hidden" value={postId} />
      )}
      {selected?.combinedRole ? (
        <FieldDescription>
          Combined job {selected.combinedRole.vacancyCode} includes {selected.combinedRole.postCodes.join(", ")}.
          Employee actions here update all included posts. Split the combined job before correcting one designation.
        </FieldDescription>
      ) : null}
      {canCorrectIdentity ? (
        <input name="identity_correction" type="hidden" value="true" />
      ) : null}
      {selected ? (
        <Alert className="w-full min-w-0">
          <AlertDescription>
            Current Assignment: {selected.post.employeeName ?? selectedAssignment?.employeeName ?? "Unassigned"}
            {(selected.post.employeeCode ?? selectedAssignment?.employeeCode)
              ? ` (${selected.post.employeeCode ?? selectedAssignment?.employeeCode})`
              : ""}{" "}
            · {selected.post.status}
            {selected.post.lastWorkingDate
              ? ` · last working date ${formatCalendarDate(selected.post.lastWorkingDate)}`
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}
      {selected?.post.status === "Resigned" && !pendingReplacement ? (
        <FieldDescription>
          Select Appointed to reserve an incoming employee. The resigning
          employee and last working date will remain unchanged.
        </FieldDescription>
      ) : null}
      {pendingReplacement ? (
        <FieldDescription>
          Select Confirm Replacement Joined and enter {pendingReplacement.employeeName}&apos;s own Employee ID.
          Both employees remain listed until the outgoing employee&apos;s last working date.
        </FieldDescription>
      ) : null}
      {selected?.post.replacementAppointments?.length ? (
        <Field>
          <FieldLabel>Replacement History</FieldLabel>
          {selected.post.replacementAppointments.map((appointment) => (
            <div className="rounded-lg border p-3 text-sm" key={appointment.id}>
              <p className="font-medium">
                {appointment.employeeName} · {appointment.status}
              </p>
              <p>Employee ID: {appointment.employeeCode || "Not assigned"}</p>
              <p>Appointed: {formatIstDateTime(appointment.appointedAt)}</p>
              {appointment.completedAt ? (
                <p>
                  {appointment.status}: {formatIstDateTime(appointment.completedAt)}
                </p>
              ) : null}
              <p className="mt-2 text-muted-foreground">
                Outgoing: {appointment.outgoingEmployeeName} (
                {appointment.outgoingEmployeeCode || "No ID"}){" · "}Last
                working date:{" "}
                {formatCalendarDate(appointment.outgoingLastWorkingDate || "Not recorded")}
              </p>
            </div>
          ))}
        </Field>
      ) : null}
      <Field className="w-full min-w-0">
        <FieldLabel htmlFor="employee-name">Employee Name</FieldLabel>
        <Input
          id="employee-name"
          name="employee_name"
          onChange={(change) => setEmployeeName(change.target.value)}
          readOnly={
            managingReplacement ||
            (assigned && !canCorrectIdentity && !appointingReplacement)
          }
          required={appointingReplacement}
          value={employeeName}
        />
        {canCorrectIdentity ? (
          <FieldDescription>
            Correcting Details Keeps This Employee On The Same Approved Post.
          </FieldDescription>
        ) : null}
      </Field>
      <Field className="w-full min-w-0">
        <FieldLabel htmlFor="employee-code">Employee ID</FieldLabel>
        <Input
          id="employee-code"
          name="employee_code"
          inputMode="numeric"
          pattern="[0-9]+"
          onChange={(change) => setEmployeeCode(change.target.value)}
          readOnly={employeeIdentityLocked}
          required={event === "Joined" || event === "Replacement Joined"}
          value={employeeCode}
        />
        <FieldDescription>Employee ID Accepts Numbers Only.</FieldDescription>
        {event === "Joined" && !employeeCode.trim() ? (
          <FieldDescription>
            Employee ID Is Required Before The Candidate Can Join And The Post
            Can Become Occupied.
          </FieldDescription>
        ) : employeeIdentityLocked ? (
          <FieldDescription>
            {event === "Designation Corrected"
              ? "Designation correction keeps the same employee and Employee ID."
              : "Employee details stay unchanged for this action."}
          </FieldDescription>
        ) : null}
      </Field>
      <Field className="w-full min-w-0">
        <FieldLabel htmlFor="employee-event">
          {awaitingJoiningConfirmation
            ? "Has The Candidate Actually Joined?"
            : "Employment Event"}
        </FieldLabel>
        <NativeSelect
          className="w-full"
          id="employee-event"
          name="employee_event"
          onChange={(change) => selectEvent(change.target.value)}
          required
          value={event}
        >
          {awaitingJoiningConfirmation ? (
            <>
              <NativeSelectOption value="">Select Yes Or No</NativeSelectOption>
              <NativeSelectOption value="Joined">
                Yes — Candidate Joined
              </NativeSelectOption>
              <NativeSelectOption value="Appointed">
                No — Keep As Appointed
              </NativeSelectOption>
              <NativeSelectOption value="Removed" disabled={candidateAppointment}>
                Remove Appointment — Becomes Vacant
              </NativeSelectOption>
            </>
          ) : (
            <>
              <NativeSelectOption value="">Select Action</NativeSelectOption>
              <NativeSelectOption
                value="Appointed"
                disabled={Boolean(pendingReplacement) || selected?.post.status === "Occupied"}
              >
                {selected?.post.status === "Resigned"
                  ? "Appointed — Pending Replacement"
                  : "Appointed — Not Joined"}
              </NativeSelectOption>
              <NativeSelectOption
                value="Joined"
                disabled={Boolean(pendingReplacement) || selected?.post.status === "Resigned"}
              >
                Joined — Becomes Occupied
              </NativeSelectOption>
              <NativeSelectOption value="Resigned" disabled={selected?.post.status !== "Occupied" && selected?.post.status !== "Resigned"}>Resigned</NativeSelectOption>
              {canWithdrawResignation ? (
                <NativeSelectOption value="Resignation Withdrawn" disabled={Boolean(pendingReplacement)}>
                  Withdraw Resignation — Keep Employee
                </NativeSelectOption>
              ) : null}
              {canChangeRole ? (
                <NativeSelectOption value="Role Changed">
                  Role Changed — Release This Post Only
                </NativeSelectOption>
              ) : null}
              {canCorrectDesignation ? (
                <NativeSelectOption value="Designation Corrected">Designation Correction</NativeSelectOption>
              ) : null}
              <NativeSelectOption
                value="Removed"
                disabled={Boolean(pendingReplacement) || candidateAppointment}
              >
                Remove Assignment — Becomes Vacant
              </NativeSelectOption>
              {pendingReplacement ? (
                <>
                  <NativeSelectOption value="Replacement Joined">
                    Confirm Replacement Joined
                  </NativeSelectOption>
                  <NativeSelectOption value="Cancel Replacement">
                    Cancel Pending Replacement
                  </NativeSelectOption>
                </>
              ) : null}
            </>
          )}
        </NativeSelect>
        {appointed && selected.post.joiningDate ? (
          <FieldDescription>
            Planned Joining Date: {formatCalendarDate(selected.post.joiningDate)}. The Post Stays
            Appointed Until Actual Joining Is Confirmed With An Employee ID.
          </FieldDescription>
        ) : null}
        {candidateAppointment ? (
          <FieldDescription>
            Use Did Not Join in Employee Master or the candidate&apos;s job to cancel
            this accepted appointment, record the reason and reopen recruitment.
          </FieldDescription>
        ) : null}
      </Field>
      {canWithdrawResignation && pendingReplacement ? (
        <FieldDescription>
          Cancel the pending replacement appointment before withdrawing this resignation.
        </FieldDescription>
      ) : null}
      {event === "Resignation Withdrawn" ? (
        <Field className="w-full min-w-0">
          <FieldLabel htmlFor="resignation-withdrawal-reason">Withdrawal Reason</FieldLabel>
          <Input id="resignation-withdrawal-reason" name="exit_note" required />
          <FieldDescription>
            Keeps this employee on the same assignment. The resignation and withdrawal remain in history.
          </FieldDescription>
        </Field>
      ) : null}
      {event === "Resigned" ? (
        <Field className="w-full min-w-0">
          <FieldLabel htmlFor="last-working-date">Planned Last Working Date</FieldLabel>
          <Input
            defaultValue={selected?.post.lastWorkingDate ?? ""}
            key={postId}
            id="last-working-date"
            name="last_working_date"
            required
            type="date"
          />
          <FieldDescription>
            The Approved Post Becomes Vacant After This Date.
          </FieldDescription>
        </Field>
      ) : null}
      {event === "Joined" || event === "Replacement Joined" ? (
        <>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="actual-joining-date">Actual Joining Date</FieldLabel>
            <Input
              defaultValue={selected?.post.joiningDate ?? ""}
              id="actual-joining-date"
              key={postId}
              name="joining_date"
              required
              type="date"
            />
          </Field>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="probation-due-on">Probation Ends On</FieldLabel>
            <Input defaultValue={selectedAssignment?.probationDueOn ?? ""}
              id="probation-due-on" key={`${postId}-${event}`} name="probation_due_on" type="date" />
            <FieldDescription>
              The saved joining record supplies this date. For a new join, leave
              blank to use the accepted Offer Letter period or, for a direct join,
              one calendar month after joining. Enter a date to override it.
            </FieldDescription>
          </Field>
        </>
      ) : null}
      {event === "Designation Corrected" ? (
        <>
          <FieldDescription>
            Corrects the recorded designation while retaining this employee&apos;s joining date,
            probation status, employee details and letters. Both posts and the reason are logged in assignment history.
          </FieldDescription>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="correct-designation-post">Correct Approved Post</FieldLabel>
            <NativeSelect id="correct-designation-post" name="destination_post_id" defaultValue="" required>
              <NativeSelectOption value="">Select Correct Post</NativeSelectOption>
              {designationTargets.map(({ post }) => (
                <NativeSelectOption key={post.id} value={post.id}>{post.postCode} · {post.designation}</NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              {designationTargets.length ? "Choose a vacant standalone post in the same department."
                : "Create a vacant approved post with the correct designation in this department first."}
            </FieldDescription>
          </Field>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="designation-correction-reason">Correction Reason</FieldLabel>
            <Input id="designation-correction-reason" name="exit_note" maxLength={1000} required />
          </Field>
        </>
      ) : null}
      {event === "Role Changed" ? (
        <>
          <FieldDescription>
            This releases only this standalone post. The employee stays on their
            other occupied posts, and this role change appears in assignment history.
          </FieldDescription>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="role-change-date">Last Day In This Role</FieldLabel>
            <Input id="role-change-date" name="last_working_date" required type="date" />
          </Field>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="role-change-note">Role Change Note</FieldLabel>
            <Input id="role-change-note" name="exit_note" />
          </Field>
        </>
      ) : null}
      {event === "Removed" &&
      (selected?.post.status === "Occupied" || selected?.post.status === "Resigned") ? (
        <>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="actual-last-working-date">Actual Last Working Date</FieldLabel>
            <Input
              id="actual-last-working-date"
              name="last_working_date"
              required
              type="date"
            />
          </Field>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="exit-type">How Did They Leave?</FieldLabel>
            <NativeSelect
              defaultValue={selected.post.status === "Resigned" ? "Resigned" : ""}
              id="exit-type"
              name="exit_type"
              required
            >
              <NativeSelectOption value="">Select Exit Type</NativeSelectOption>
              <NativeSelectOption value="Resigned">Resigned Through Process</NativeSelectOption>
              <NativeSelectOption value="Left Without Process">Left Without Process</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field className="w-full min-w-0">
            <FieldLabel htmlFor="exit-note">Exit Note</FieldLabel>
            <Input id="exit-note" name="exit_note" />
          </Field>
        </>
      ) : null}
      {selectedAssignment?.resignationHistory?.length ? (
        <Field>
          <FieldLabel>Resignation History</FieldLabel>
          <EmployeeResignationHistory history={selectedAssignment.resignationHistory} />
        </Field>
      ) : null}
    </>
  )
}
