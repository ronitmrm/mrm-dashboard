export type RecruitmentMasterKind =
  | "department"
  | "designation"
  | "employee-assignment"

export function normalizeRecruitmentMasterKind(
  value: unknown
): RecruitmentMasterKind {
  if (value === "designation" || value === "employee-assignment") return value
  return "department"
}

export function recruitmentMasterHref(
  view: "dataEntry" | "masterTables",
  kind: RecruitmentMasterKind
) {
  const params = new URLSearchParams({
    panel:
      kind === "employee-assignment" ? "employeeMasterPanel" : "mastersPanel",
    masterView: view,
    kind,
  })
  return `/hr?${params.toString()}`
}
