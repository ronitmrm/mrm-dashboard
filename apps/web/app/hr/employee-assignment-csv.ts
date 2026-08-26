import type {
  RecruitmentCombinedRoleRow,
  RecruitmentPostRow,
} from "@workspace/db"

export const employeeAssignmentCsvColumns = [
  "target_type",
  "target_code",
  "approved_post_codes",
  "department",
  "designation",
  "employee_name",
  "employee_code",
] as const

function joined(values: string[]) {
  return [...new Set(values.filter(Boolean))].join(", ")
}

export function employeeAssignmentCsvRows(input: {
  combinedRoles: RecruitmentCombinedRoleRow[]
  posts: RecruitmentPostRow[]
}) {
  const postByCode = new Map(input.posts.map((post) => [post.postCode, post]))
  const activeCombinedRoles = input.combinedRoles.filter(
    (role) => role.status === "Active" && role.vacancyCode
  )
  const combinedPostCodes = new Set(
    activeCombinedRoles.flatMap((role) => role.postCodes)
  )
  const row = (
    targetType: "combined" | "individual",
    targetCode: string,
    posts: RecruitmentPostRow[]
  ) => ({
    approved_post_codes: posts.map((post) => post.postCode).join(", "),
    department: joined(posts.map((post) => post.department)),
    designation: joined(posts.map((post) => post.designation)),
    employee_code: "",
    employee_name: "",
    target_code: targetCode,
    target_type: targetType,
  })

  const combinedRows = activeCombinedRoles.flatMap((role) => {
    const memberPosts = role.postCodes.flatMap((code) => {
      const post = postByCode.get(code)
      return post ? [post] : []
    })
    return memberPosts.length === role.postCodes.length &&
      memberPosts.every((post) => post.status === "Vacant")
      ? [row("combined", role.vacancyCode!, memberPosts)]
      : []
  })
  const individualRows = input.posts
    .filter(
      (post) =>
        post.status === "Vacant" && !combinedPostCodes.has(post.postCode)
    )
    .map((post) => row("individual", post.postCode, [post]))

  return [...combinedRows, ...individualRows]
}
