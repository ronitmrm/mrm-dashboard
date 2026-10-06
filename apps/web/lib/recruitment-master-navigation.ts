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

export function linkedTemplateHref(
  templateCode: string,
  sourceQuery: string,
  employeeView: boolean
) {
  const returnParams = new URLSearchParams(sourceQuery)
  returnParams.set(
    "panel",
    employeeView ? "employeeMasterPanel" : "approvedPostPanel"
  )
  const params = new URLSearchParams({
    panel: "postMasterPanel",
    masterView: "masterTables",
    template: templateCode,
    returnTo: `/hr?${returnParams.toString()}`,
  })
  return `/hr?${params.toString()}`
}

export function templateReturnPath(value: string | null) {
  if (!value?.startsWith("/hr?")) return null
  const destination = new URL(value, "http://localhost")
  const panel = destination.searchParams.get("panel")
  if (panel !== "employeeMasterPanel" && panel !== "approvedPostPanel") {
    return null
  }
  return `${destination.pathname}${destination.search}`
}
