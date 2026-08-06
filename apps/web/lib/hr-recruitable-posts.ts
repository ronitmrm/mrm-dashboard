import type { RecruitmentJobRow, RecruitmentPostRow } from "@workspace/db"

export function listRecruitableApprovedPosts(
  posts: RecruitmentPostRow[],
  jobs: RecruitmentJobRow[]
) {
  const postsWithOpenJobs = new Set(
    jobs
      .filter((job) => job.status === "Open" && job.postCode)
      .map((job) => job.postCode)
  )

  return posts.filter(
    (post) =>
      (post.status === "Vacant" || post.status === "Resigned") &&
      !postsWithOpenJobs.has(post.postCode)
  )
}
