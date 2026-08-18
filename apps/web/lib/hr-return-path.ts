const hrPath = "/hr"
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function hrReturnPath(formData: FormData) {
  const returnCandidateId = formValue(formData, "return_candidate_id")
  if (uuidPattern.test(returnCandidateId)) {
    return `${hrPath}/candidates/${returnCandidateId}`
  }

  const returnJobId = formValue(formData, "return_job_id")
  if (uuidPattern.test(returnJobId)) {
    return `${hrPath}/jobs/${returnJobId}`
  }

  const panel = formValue(formData, "panel")
  const params = new URLSearchParams({ panel: panel || "mastersPanel" })
  const masterView = formValue(formData, "master_view")
  if (masterView === "dataEntry" || masterView === "masterTables") {
    params.set("masterView", masterView)
  }
  const masterKind =
    formValue(formData, "master_kind") || formValue(formData, "kind")
  if (masterKind === "department" || masterKind === "designation") {
    params.set("kind", masterKind)
  }
  const selectedJobId = formValue(formData, "job_id")
  if (panel === "candidateSearchPanel" && uuidPattern.test(selectedJobId)) {
    params.set("job", selectedJobId)
  }
  return `${hrPath}?${params}`
}

function formValue(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() ?? ""
}
