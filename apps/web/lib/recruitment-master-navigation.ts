export type RecruitmentMasterKind = "department" | "designation"

export function normalizeRecruitmentMasterKind(
  value: unknown
): RecruitmentMasterKind {
  return value === "designation" ? "designation" : "department"
}

export function recruitmentMasterHref(
  view: "dataEntry" | "masterTables",
  kind: RecruitmentMasterKind
) {
  const params = new URLSearchParams({
    panel: "mastersPanel",
    masterView: view,
    kind,
  })
  return `/hr?${params.toString()}`
}
