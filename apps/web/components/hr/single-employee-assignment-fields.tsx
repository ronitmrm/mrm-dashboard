"use client"

import type {
  RecruitmentCombinedRoleRow,
  RecruitmentPostRow,
} from "@workspace/db"
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

function initialEmploymentEvent(status?: string) {
  if (status === "Appointed") return "Joined"
  if (status === "Resigned") return "Resigned"
  if (status === "Occupied") return ""
  return "Appointed"
}

export function SingleEmployeeAssignmentFields({
  combinedRoles,
  initialPostId = "",
  posts,
  showTargetSelector = true,
}: {
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
  const initialTarget = targets.find(({ post }) => post.id === initialPostId)
  const [postId, setPostId] = useState(initialPostId)
  const [employeeName, setEmployeeName] = useState(
    initialTarget?.post.employeeName ?? ""
  )
  const [employeeCode, setEmployeeCode] = useState(
    initialTarget?.post.employeeCode ?? ""
  )
  const [event, setEvent] = useState(
    initialEmploymentEvent(initialTarget?.post.status)
  )
  const selected = targets.find(({ post }) => post.id === postId)
  const occupied = Boolean(
    selected?.post.employeeName || selected?.post.employeeCode
  )

  function selectTarget(nextPostId: string) {
    const next = targets.find(({ post }) => post.id === nextPostId)
    setPostId(nextPostId)
    setEmployeeName(next?.post.employeeName ?? "")
    setEmployeeCode(next?.post.employeeCode ?? "")
    setEvent(initialEmploymentEvent(next?.post.status))
  }

  return (
    <>
      {showTargetSelector ? (
        <Field className="w-full min-w-0">
          <FieldLabel htmlFor="employee-post">
            Approved post or combined job
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
            Select post or combined job
          </NativeSelectOption>
          {combinedTargets.length ? (
            <NativeSelectOptGroup label="Combined jobs">
              {combinedTargets.map(({ combinedRole, post }) => (
                <NativeSelectOption key={combinedRole!.id} value={post.id}>
                  {combinedRole!.vacancyCode} · {combinedRole!.name} · includes{" "}
                  {combinedRole!.postCodes.join(", ")}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          ) : null}
          {individualTargets.length ? (
            <NativeSelectOptGroup label="Individual approved posts">
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
              Included posts: {selected.combinedRole.postCodes.join(", ")}. One
              employee assignment updates the complete combined job.
            </FieldDescription>
          ) : null}
        </Field>
      ) : (
        <input name="post_id" type="hidden" value={postId} />
      )}
      {selected ? (
        <Alert className="w-full min-w-0">
          <AlertDescription>
            Current assignment: {selected.post.employeeName ?? "Unassigned"}
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
        <FieldLabel htmlFor="employee-name">Employee name</FieldLabel>
        <Input
          id="employee-name"
          name="employee_name"
          onChange={(change) => setEmployeeName(change.target.value)}
          readOnly={occupied}
          value={employeeName}
        />
      </Field>
      <Field className="w-full min-w-0">
        <FieldLabel htmlFor="employee-code">Employee code</FieldLabel>
        <Input
          id="employee-code"
          name="employee_code"
          onChange={(change) => setEmployeeCode(change.target.value)}
          readOnly={occupied}
          value={employeeCode}
        />
        {occupied ? (
          <FieldDescription>
            Employee details stay locked until this post is vacated.
          </FieldDescription>
        ) : null}
      </Field>
      <Field className="w-full min-w-0">
        <FieldLabel htmlFor="employee-event">Employment event</FieldLabel>
        <NativeSelect
          className="w-full"
          id="employee-event"
          name="employee_event"
          onChange={(change) => setEvent(change.target.value)}
          required
          value={event}
        >
          <NativeSelectOption value="">Select action</NativeSelectOption>
          <NativeSelectOption value="Appointed">
            Appointed — not joined
          </NativeSelectOption>
          <NativeSelectOption value="Joined">
            Joined — becomes Occupied
          </NativeSelectOption>
          <NativeSelectOption value="Resigned">Resigned</NativeSelectOption>
          <NativeSelectOption value="Removed">
            Remove assignment — becomes Vacant
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      {event === "Resigned" ? (
        <Field className="w-full min-w-0">
          <FieldLabel htmlFor="last-working-date">Last working date</FieldLabel>
          <Input
            id="last-working-date"
            name="last_working_date"
            required
            type="date"
          />
          <FieldDescription>
            The approved post becomes vacant after this date.
          </FieldDescription>
        </Field>
      ) : null}
    </>
  )
}
