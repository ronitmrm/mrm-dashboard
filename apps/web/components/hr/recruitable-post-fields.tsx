"use client"

import type { RecruitmentPostRow } from "@workspace/db"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

type RecruitablePost = Pick<
  RecruitmentPostRow,
  | "combinedRoleId"
  | "combinedRoleName"
  | "combinedVacancyCode"
  | "department"
  | "designation"
  | "id"
  | "postCode"
  | "status"
  | "vacancyCode"
> & { combinedPostCodes: string[] }

export function RecruitablePostFields({ posts }: { posts: RecruitablePost[] }) {
  const combinedJobs = posts.filter((post) => post.combinedRoleId)
  const individualPosts = posts.filter((post) => !post.combinedRoleId)
  return (
    <Field className="md:col-span-2 xl:col-span-3">
      <FieldLabel htmlFor="job-post">Vacant post or combined job</FieldLabel>
      <NativeSelect className="w-full" id="job-post" name="post_id" required>
        <NativeSelectOption value="">Select one vacancy</NativeSelectOption>
        {combinedJobs.length ? (
          <NativeSelectOptGroup label="Combined jobs — one candidate fills the complete role">
            {combinedJobs.map((post) => (
              <NativeSelectOption key={post.id} value={post.id}>
                {post.combinedVacancyCode ?? post.vacancyCode} ·{" "}
                {post.combinedRoleName} · includes{" "}
                {post.combinedPostCodes.join(", ")}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ) : null}
        {individualPosts.length ? (
          <NativeSelectOptGroup label="Individual approved posts">
            {individualPosts.map((post) => (
              <NativeSelectOption key={post.id} value={post.id}>
                {post.postCode} · {post.department} · {post.designation} ·{" "}
                {post.status}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ) : null}
      </NativeSelect>
      <FieldDescription>
        A combined selection shows every included Post Code. It creates one job
        opening and its member posts are not offered separately.
      </FieldDescription>
    </Field>
  )
}
