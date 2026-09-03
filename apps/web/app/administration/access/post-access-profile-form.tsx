"use client"

import { useActionState, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import { FormGrid } from "@/components/ui/golden-patterns"
import type { createAccessAdministrationService } from "@/lib/auth/access-administration"

import { setPostRoleAction } from "./actions"

type AccessSnapshot = Awaited<
  ReturnType<
    ReturnType<typeof createAccessAdministrationService>["getSnapshot"]
  >
>
type ApplicationRole = Pick<
  AccessSnapshot["roles"][number],
  "id" | "key" | "name" | "isSystem"
>

export function PostAccessProfileForm({
  posts,
  roles,
}: {
  posts: AccessSnapshot["postAccessProfiles"]
  roles: ApplicationRole[]
}) {
  const [postId, setPostId] = useState("")
  const [designation, setDesignation] = useState("")
  const post = posts.find((profile) => profile.id === postId)
  const ready = post && designation === post.designation

  return (
    <FieldGroup className="min-w-0 gap-4">
      <FormGrid className="xl:grid-cols-2">
        <Field className="relative min-w-0">
          <FieldLabel htmlFor="profile-post" id="profile-post-label">
            1. Approved Post
          </FieldLabel>
          <NativeSelect
            aria-labelledby="profile-post-label"
            className="w-full"
            id="profile-post"
            onChange={(event) => {
              setPostId(event.target.value)
              setDesignation("")
            }}
            value={postId}
          >
            <NativeSelectOption value="">Select a post</NativeSelectOption>
            {posts.map((profile) => (
              <NativeSelectOption key={profile.id} value={profile.id}>
                {profile.postCode} · {profile.department}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="relative min-w-0" data-disabled={!post}>
          <FieldLabel
            htmlFor="profile-designation"
            id="profile-designation-label"
          >
            2. Designation
          </FieldLabel>
          <NativeSelect
            aria-describedby="profile-designation-help"
            aria-labelledby="profile-designation-label"
            className="w-full"
            disabled={!post}
            id="profile-designation"
            onChange={(event) => setDesignation(event.target.value)}
            value={designation}
          >
            <NativeSelectOption value="">Select designation</NativeSelectOption>
            {post ? (
              <NativeSelectOption value={post.designation}>
                {post.designation}
              </NativeSelectOption>
            ) : null}
          </NativeSelect>
          <FieldDescription id="profile-designation-help">
            Only the designation linked to this post is available.
          </FieldDescription>
        </Field>
      </FormGrid>
      {ready ? (
        <FieldGroup className="gap-4" key={`${post.id}:${designation}`}>
          <Field>
            <FieldLabel htmlFor="profile-occupant">
              3. Current Occupant
            </FieldLabel>
            <output
              className="text-sm break-words"
              id="profile-occupant"
              aria-live="polite"
            >
              {post.occupant
                ? `${post.occupant.employeeName} · ${post.occupant.employeeCode}`
                : "No current occupant"}
            </output>
            <FieldDescription>
              {!post.occupant
                ? "Roles stay with this post and apply when an employee occupies it."
                : !post.occupant.linkedUserId
                  ? "No staff account linked yet. Provision one to enable sign-in."
                  : "Roles apply to this employee through the selected post."}
            </FieldDescription>
          </Field>
          <PostRoleForm
            post={post}
            roles={roles.filter((role) => !role.isSystem)}
          />
        </FieldGroup>
      ) : (
        <FieldDescription>
          Select a post and designation to view its occupant and manage roles.
        </FieldDescription>
      )}
    </FieldGroup>
  )
}

function PostRoleForm({
  post,
  roles,
}: {
  post: AccessSnapshot["postAccessProfiles"][number]
  roles: ApplicationRole[]
}) {
  const [result, action, pending] = useActionState(
    async (
      _previous: { error: boolean; message: string } | null,
      formData: FormData
    ) => {
      try {
        await setPostRoleAction(formData)
        return { error: false, message: "Post access saved." }
      } catch {
        return {
          error: true,
          message: "Could not save post access. Refresh and try again.",
        }
      }
    },
    null
  )
  return (
    <form action={action}>
      <input name="postId" type="hidden" value={post.id} />
      <fieldset disabled={pending}>
        <FieldGroup className="gap-4">
          <FormGrid className="xl:grid-cols-2">
            <Field className="relative min-w-0">
              <FieldLabel htmlFor="profile-role" id="profile-role-label">
                4. Application Role
              </FieldLabel>
              <NativeSelect
                aria-labelledby="profile-role-label"
                className="w-full"
                defaultValue=""
                id="profile-role"
                name="roleKey"
                required
              >
                <NativeSelectOption value="">Select a role</NativeSelectOption>
                {roles.map((role) => (
                  <NativeSelectOption key={role.id} value={role.key}>
                    {role.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="relative min-w-0">
              <FieldLabel htmlFor="profile-effect" id="profile-effect-label">
                Change
              </FieldLabel>
              <NativeSelect
                aria-labelledby="profile-effect-label"
                className="w-full"
                id="profile-effect"
                name="effect"
                required
              >
                <NativeSelectOption value="assign">
                  Assign Role
                </NativeSelectOption>
                <NativeSelectOption value="remove">
                  Remove Role
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </FormGrid>
          <FieldDescription className="break-words" aria-live="polite">
            Current post roles:{" "}
            {roles
              .filter((role) => post.roleKeys.includes(role.key))
              .map((role) => role.name)
              .join(", ") || "None"}
            . Assign additional roles one at a time; other roles are kept.
          </FieldDescription>
          <Button
            className="w-full sm:w-fit"
            disabled={pending || roles.length === 0}
            type="submit"
          >
            {pending ? "Saving…" : "Save Post Access"}
          </Button>
          {result && !pending ? (
            <p className="text-sm" role={result.error ? "alert" : "status"}>
              {result.message}
            </p>
          ) : null}
        </FieldGroup>
      </fieldset>
    </form>
  )
}
