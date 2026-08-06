"use client"

import type { RecruitmentPostRow } from "@workspace/db"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { useState } from "react"

type RecruitablePost = Pick<
  RecruitmentPostRow,
  | "department"
  | "designation"
  | "id"
  | "postCode"
  | "status"
  | "vacancyCode"
>

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  )
}

export function RecruitablePostFields({ posts }: { posts: RecruitablePost[] }) {
  const [department, setDepartment] = useState("")
  const [designation, setDesignation] = useState("")
  const [postId, setPostId] = useState("")
  const departments = unique(posts.map((post) => post.department))
  const designations = unique(
    posts
      .filter((post) => post.department === department)
      .map((post) => post.designation)
  )
  const matchingPosts = posts.filter(
    (post) =>
      post.department === department && post.designation === designation
  )
  const selectedPostId = matchingPosts.some((post) => post.id === postId)
    ? postId
    : (matchingPosts[0]?.id ?? "")

  return (
    <>
      <Field>
        <FieldLabel htmlFor="job-department">Department</FieldLabel>
        <NativeSelect
          className="w-full"
          id="job-department"
          onChange={(event) => {
            setDepartment(event.target.value)
            setDesignation("")
            setPostId("")
          }}
          required
          value={department}
        >
          <NativeSelectOption value="">Select department</NativeSelectOption>
          {departments.map((name) => (
            <NativeSelectOption key={name} value={name}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="job-designation">Designation</FieldLabel>
        <NativeSelect
          className="w-full"
          disabled={!department}
          id="job-designation"
          onChange={(event) => {
            const nextDesignation = event.target.value
            const firstMatch = posts.find(
              (post) =>
                post.department === department &&
                post.designation === nextDesignation
            )
            setDesignation(nextDesignation)
            setPostId(firstMatch?.id ?? "")
          }}
          required
          value={designation}
        >
          <NativeSelectOption value="">Select designation</NativeSelectOption>
          {designations.map((name) => (
            <NativeSelectOption key={name} value={name}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="job-post">
          Approved post (automatically selected)
        </FieldLabel>
        <NativeSelect
          className="w-full"
          id="job-post"
          name="post_id"
          onChange={(event) => setPostId(event.target.value)}
          required
          value={selectedPostId}
        >
          <NativeSelectOption value="">
            Select department and designation
          </NativeSelectOption>
          {matchingPosts.map((post) => (
            <NativeSelectOption key={post.id} value={post.id}>
              {post.postCode} · {post.status} · vacancy {post.vacancyCode}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldDescription>
          The first eligible post is selected automatically. If several posts
          remain, you can change it here.
        </FieldDescription>
      </Field>
    </>
  )
}
