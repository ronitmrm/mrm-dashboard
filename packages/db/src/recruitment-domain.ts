function optionalText(value: unknown) {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function requiredText(value: unknown, label: string) {
  const normalized = optionalText(value)
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

const activeRecruitmentApplicationStatuses = new Set([
  "Assigned",
  "Hold",
  "Interview",
])

export function isActiveRecruitmentApplicationStatus(status: string) {
  return activeRecruitmentApplicationStatuses.has(status)
}

export function deriveRecruitmentPostStatus(input: {
  currentDate?: string | null
  employeeCode?: string | null
  employeeName?: string | null
  joiningDate?: string | null
  storedStatus?: string | null
}) {
  if (input.storedStatus === "Inactive") return "Inactive"
  if (!optionalText(input.employeeName) && !optionalText(input.employeeCode)) {
    return "Vacant"
  }
  if (input.storedStatus === "Appointed") return "Appointed"
  if (input.storedStatus === "Resigned") return "Resigned"
  return optionalText(input.employeeCode) ? "Occupied" : "Appointed"
}

export function recruitmentPostDeletionBlocker(input: {
  combinedRoleLinks: number
  employeeCode?: string | null
  employeeName?: string | null
  jobPostLinks: number
}) {
  if (optionalText(input.employeeName) || optionalText(input.employeeCode)) {
    return "Remove the employee assignment before deleting this approved post."
  }
  if (input.combinedRoleLinks > 0) {
    return "Edit the combined role and remove this post from it before deleting the approved post."
  }
  if (input.jobPostLinks > 0) {
    return "This approved post cannot be deleted because a job post is linked to it."
  }
  return null
}

export function deriveRecruitmentEmployeeAssignment(input: {
  currentEmployeeCode?: string | null
  currentEmployeeName?: string | null
  employeeCode?: string | null
  employeeEvent?: string | null
  employeeName?: string | null
  lastWorkingDate?: string | null
}) {
  const event = requiredText(input.employeeEvent, "Employee event")
  if (event === "Removed") {
    return {
      employeeCode: null,
      employeeName: null,
      lastWorkingDate: null,
      status: "Vacant",
    }
  }
  const providedEmployeeCode = optionalText(input.employeeCode)
  if (providedEmployeeCode && !/^\d+$/.test(providedEmployeeCode)) {
    throw new Error("Employee ID must contain numbers only.")
  }
  const employeeCode =
    providedEmployeeCode ?? optionalText(input.currentEmployeeCode)
  const employeeName =
    optionalText(input.employeeName) ?? optionalText(input.currentEmployeeName)
  if (event === "Joined" && !employeeCode) {
    throw new Error("Employee ID is required before the candidate can join.")
  }
  if (!employeeCode && !employeeName) {
    throw new Error("Employee name or employee code is required.")
  }
  const statuses = {
    Appointed: "Appointed",
    Joined: "Occupied",
    Resigned: "Resigned",
  } as const
  const status = statuses[event as keyof typeof statuses]
  if (!status) throw new Error("Employee event is invalid.")
  const lastWorkingDate = optionalText(input.lastWorkingDate)
  if (status === "Resigned" && !lastWorkingDate) {
    throw new Error("Last working date is required when an employee resigns.")
  }
  return {
    employeeCode,
    employeeName,
    lastWorkingDate: status === "Resigned" ? lastWorkingDate : null,
    status,
  }
}

type CombinedPostAssignmentSource = {
  appointedApplicationId?: string | null
  employeeCode?: string | null
  employeeName?: string | null
  joiningDate?: string | null
  lastWorkingDate?: string | null
  status: string
}

function sameEmployee(
  left: CombinedPostAssignmentSource,
  right: CombinedPostAssignmentSource
) {
  const leftCode = optionalText(left.employeeCode)?.toLocaleLowerCase("en-IN")
  const rightCode = optionalText(right.employeeCode)?.toLocaleLowerCase("en-IN")
  if (leftCode && rightCode) return leftCode === rightCode

  const leftName = optionalText(left.employeeName)?.toLocaleLowerCase("en-IN")
  const rightName = optionalText(right.employeeName)?.toLocaleLowerCase("en-IN")
  return Boolean(leftName && rightName && leftName === rightName)
}

export function deriveCombinedPostAssignment(
  posts: readonly CombinedPostAssignmentSource[]
) {
  const assignedPosts = posts.filter(
    (post) => optionalText(post.employeeCode) || optionalText(post.employeeName)
  )
  if (!assignedPosts.length) return null

  const statusPriority: Readonly<Record<string, number>> = {
    Appointed: 2,
    Occupied: 3,
    Resigned: 1,
  }
  const source = [...assignedPosts].sort(
    (left, right) =>
      (statusPriority[right.status] ?? 0) - (statusPriority[left.status] ?? 0)
  )[0]!

  if (assignedPosts.some((post) => !sameEmployee(source, post))) {
    throw new Error(
      "Combined approved posts are assigned to different employees. Vacate the conflicting posts before combining them."
    )
  }

  return {
    appointedApplicationId: optionalText(source.appointedApplicationId),
    employeeCode: optionalText(source.employeeCode),
    employeeName: optionalText(source.employeeName),
    joiningDate: optionalText(source.joiningDate),
    lastWorkingDate: optionalText(source.lastWorkingDate),
    status: source.status,
  }
}

export function listRecruitableApprovedPosts<
  Post extends {
    combinedRoleId?: string | null
    isPrimaryCombinedPost?: boolean
    postCode: string
    status: string
  },
  Job extends { postCode: string | null; status: string },
>(posts: readonly Post[], jobs: readonly Job[]) {
  const postsWithOpenJobs = new Set(
    jobs
      .filter((job) => job.status === "Open" && job.postCode)
      .map((job) => job.postCode)
  )

  return posts.filter(
    (post) =>
      (post.status === "Vacant" || post.status === "Resigned") &&
      (!post.combinedRoleId || post.isPrimaryCombinedPost) &&
      !postsWithOpenJobs.has(post.postCode)
  )
}

export function resolveRecruitmentEmployeeAssignmentTarget<
  Post extends {
    combinedRoleId?: string | null
    id: string
    isPrimaryCombinedPost?: boolean
  },
>(posts: readonly Post[], requestedPostId: string) {
  const requestedPost = posts.find((post) => post.id === requestedPostId)
  if (!requestedPost?.combinedRoleId) return requestedPost ?? null

  return (
    posts.find(
      (post) =>
        post.combinedRoleId === requestedPost.combinedRoleId &&
        post.isPrimaryCombinedPost
    ) ?? requestedPost
  )
}
