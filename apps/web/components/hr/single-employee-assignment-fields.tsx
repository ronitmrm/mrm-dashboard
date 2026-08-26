"use client"

import type {
  RecruitmentCombinedRoleRow,
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

type AssignmentTarget = {
  combinedRole: RecruitmentCombinedRoleRow | null
  post: RecruitmentPostRow
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
  initialPostId = "",
  posts,
  showTargetSelector = true,
}: {
  allowIdentityCorrection?: boolean
  combinedRoles: RecruitmentCombinedRoleRow[]
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
  const [employeeName, setEmployeeName] = useState(
    initialTarget?.post.employeeName ?? ""
  )
  const [employeeCode, setEmployeeCode] = useState(
    initialTarget?.post.employeeCode ?? ""
  )
  const [event, setEvent] = useState(
    initialEmploymentEvent(initialTarget?.post.status, allowIdentityCorrection)
  )
  const selected = targets.find(({ post }) => post.id === postId)
  const assigned = Boolean(
    selected?.post.employeeName || selected?.post.employeeCode
  )
  const appointed = selected?.post.status === "Appointed"
  const awaitingJoiningConfirmation = Boolean(
    appointed && selected?.post.joiningConfirmationDue
  )
  const employeeIdentityLocked = selected?.post.status === "Resigned"
  const canCorrectIdentity = Boolean(
    allowIdentityCorrection &&
    assigned &&
    (selected?.post.status === "Appointed" ||
      selected?.post.status === "Occupied")
  )

  function selectTarget(nextPostId: string) {
    const next = targets.find(({ post }) => post.id === nextPostId)
    setPostId(nextPostId)
    setEmployeeName(next?.post.employeeName ?? "")
    setEmployeeCode(next?.post.employeeCode ?? "")
    setEvent(initialEmploymentEvent(next?.post.status, allowIdentityCorrection))
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
          {selected?.combinedRole ? (
            <FieldDescription>
              Included Posts: {selected.combinedRole.postCodes.join(", ")}. One
              Employee Assignment Updates The Complete Combined Job.
            </FieldDescription>
          ) : null}
        </Field>
      ) : (
        <input name="post_id" type="hidden" value={postId} />
      )}
      {canCorrectIdentity ? (
        <input name="identity_correction" type="hidden" value="true" />
      ) : null}
      {selected ? (
        <Alert className="w-full min-w-0">
          <AlertDescription>
            Current Assignment: {selected.post.employeeName ?? "Unassigned"}
            {selected.post.employeeCode
              ? ` (${selected.post.employeeCode})`
              : ""}{" "}
            · {selected.post.status}
            {selected.post.lastWorkingDate
              ? ` · last working date ${selected.post.lastWorkingDate}`
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}
      <Field className="w-full min-w-0">
        <FieldLabel htmlFor="employee-name">Employee Name</FieldLabel>
        <Input
          id="employee-name"
          name="employee_name"
          onChange={(change) => setEmployeeName(change.target.value)}
          readOnly={assigned && !canCorrectIdentity}
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
          required={event === "Joined"}
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
            Employee Details Stay Locked Until This Post Is Vacated.
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
          onChange={(change) => setEvent(change.target.value)}
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
              <NativeSelectOption value="Removed">
                Remove Appointment — Becomes Vacant
              </NativeSelectOption>
            </>
          ) : (
            <>
              <NativeSelectOption value="">Select Action</NativeSelectOption>
              <NativeSelectOption value="Appointed">
                Appointed — Not Joined
              </NativeSelectOption>
              <NativeSelectOption value="Joined">
                Joined — Becomes Occupied
              </NativeSelectOption>
              <NativeSelectOption value="Resigned">Resigned</NativeSelectOption>
              <NativeSelectOption value="Removed">
                Remove Assignment — Becomes Vacant
              </NativeSelectOption>
            </>
          )}
        </NativeSelect>
        {appointed && selected.post.joiningDate ? (
          <FieldDescription>
            Planned Joining Date: {selected.post.joiningDate}. The Post Stays
            Appointed Until Actual Joining Is Confirmed With An Employee ID.
          </FieldDescription>
        ) : null}
      </Field>
      {event === "Resigned" ? (
        <Field className="w-full min-w-0">
          <FieldLabel htmlFor="last-working-date">Last Working Date</FieldLabel>
          <Input
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
    </>
  )
}
