export type StoreRequestContext = {
  employeeDepartments: readonly string[]
  isAdministrator: boolean
  organizationDepartments: readonly string[]
  requesterEmail: string
  storeLocation: { code: string; id?: string; name: string } | null
}

export type StoreRequestFormPolicy = {
  departmentLocked: boolean
  departmentOptions: string[]
  departmentValue: string
  requestedBy: string
  storeLabel: string
  submitDisabled: boolean
}

function uniqueNames(values: readonly string[]) {
  const names = new Map<string, string>()
  for (const value of values) {
    const name = value.trim()
    if (name) names.set(name.toLocaleLowerCase(), name)
  }
  return [...names.values()].sort((left, right) => left.localeCompare(right))
}

export function storeRequestFormPolicy(
  context: StoreRequestContext
): StoreRequestFormPolicy {
  const employeeDepartments = uniqueNames(context.employeeDepartments)
  const departmentOptions = employeeDepartments.length
    ? employeeDepartments
    : context.isAdministrator
      ? uniqueNames(context.organizationDepartments)
      : []

  return {
    departmentLocked: departmentOptions.length === 1,
    departmentOptions,
    departmentValue:
      departmentOptions.length === 1 ? departmentOptions[0]! : "",
    requestedBy: context.requesterEmail.trim().toLocaleLowerCase(),
    storeLabel: context.storeLocation
      ? `${context.storeLocation.code} — ${context.storeLocation.name}`
      : "Main Store",
    submitDisabled: departmentOptions.length === 0,
  }
}

export function resolveStoreRequestDepartment(
  policy: StoreRequestFormPolicy,
  submittedDepartment: string | null | undefined
) {
  if (!policy.departmentOptions.length) {
    throw new Error(
      "Link the signed-in account to Employee Master before requesting Store items."
    )
  }
  if (policy.departmentLocked) return policy.departmentOptions[0]!

  const submitted = submittedDepartment?.trim()
  const department = policy.departmentOptions.find(
    (option) => option.toLocaleLowerCase() === submitted?.toLocaleLowerCase()
  )
  if (!department) {
    throw new Error("Select a department assigned to the signed-in user.")
  }
  return department
}
