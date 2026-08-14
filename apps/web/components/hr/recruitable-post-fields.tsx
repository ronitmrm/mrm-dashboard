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
      <FieldLabel htmlFor="job-post">Vacant Post Or Combined Job</FieldLabel>
      <NativeSelect className="w-full" id="job-post" name="post_id" required>
        <NativeSelectOption value="">Select One Vacancy</NativeSelectOption>
        {combinedJobs.length ? (
          <NativeSelectOptGroup label="Combined Jobs — One Candidate Fills The Complete Role">
            {combinedJobs.map((post) => (
              <NativeSelectOption key={post.id} value={post.id}>
                {post.combinedVacancyCode ?? post.vacancyCode} ·{" "}
                {post.combinedRoleName} · Includes{" "}
                {post.combinedPostCodes.join(", ")}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ) : null}
        {individualPosts.length ? (
          <NativeSelectOptGroup label="Individual Approved Posts">
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
        A Combined Selection Shows Every Included Post Code. It Creates One Job
        Opening And Its Member Posts Are Not Offered Separately.
      </FieldDescription>
    </Field>
  )
}
