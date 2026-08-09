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
    initialTarget?.post.status === "Occupied"
      ? "Joined"
      : initialTarget?.post.status === "Resigned"
        ? "Resigned"
        : "Appointed"
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
    setEvent(
      next?.post.status === "Occupied"
        ? "Joined"
        : next?.post.status === "Resigned"
          ? "Resigned"
          : "Appointed"
    )
  }

  return (
    <>
      {showTargetSelector ? (
      <Field className="md:col-span-2 xl:col-span-3">
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
        <Alert className="md:col-span-2 xl:col-span-3">
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
      <Field>
        <FieldLabel htmlFor="employee-name">Employee name</FieldLabel>
        <Input
          id="employee-name"
          name="employee_name"
          onChange={(change) => setEmployeeName(change.target.value)}
          value={employeeName}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="employee-code">Employee code</FieldLabel>
        <Input
          id="employee-code"
          name="employee_code"
          onChange={(change) => setEmployeeCode(change.target.value)}
          value={employeeCode}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="employee-event">Employment event</FieldLabel>
        <NativeSelect
          className="w-full"
          id="employee-event"
          name="employee_event"
          onChange={(change) => setEvent(change.target.value)}
          required
          value={event}
        >
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
        <Field>
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
      {occupied && (event === "Appointed" || event === "Joined") ? (
        <Alert className="md:col-span-2 xl:col-span-3" variant="destructive">
          <AlertDescription>
            A different employee cannot replace the current employee directly.
            First save Remove assignment, or save Resigned with the last working
            date; assign the new person only after the post is vacant.
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}
