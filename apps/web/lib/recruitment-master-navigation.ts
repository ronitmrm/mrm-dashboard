export type RecruitmentMasterKind =
  | "department"
  | "designation"
  | "employee-assignment"
  | "job-template"

export function normalizeRecruitmentMasterKind(
  value: unknown
): RecruitmentMasterKind {
  if (
    value === "designation" ||
    value === "employee-assignment" ||
    value === "job-template"
  ) {
    return value
  }
  return "department"
}

export function recruitmentMasterHref(
  view: "dataEntry" | "masterTables",
  kind: RecruitmentMasterKind
) {
  const params = new URLSearchParams({
    panel:
      kind === "employee-assignment"
        ? "employeeMasterPanel"
        : kind === "job-template"
          ? "postMasterPanel"
          : "mastersPanel",
    masterView: view,
    kind,
  })
  return `/hr?${params.toString()}`
}
