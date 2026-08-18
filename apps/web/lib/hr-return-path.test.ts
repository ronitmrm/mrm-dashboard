import { describe, expect, it } from "vitest"

import { hrReturnPath } from "./hr-return-path"

const jobId = "123e4567-e89b-12d3-a456-426614174000"
const candidateId = "123e4567-e89b-12d3-a456-426614174001"

describe("HR action return path", () => {
  it("keeps HR master saves inside the selected company workspace", () => {
    const formData = new FormData()
    formData.set("panel", "mastersPanel")
    formData.set("master_view", "masterTables")
    formData.set("master_kind", "designation")

    expect(hrReturnPath(formData)).toBe(
      "/hr?panel=mastersPanel&masterView=masterTables&kind=designation"
    )
  })

  it("returns to the originating job after assigning candidates", () => {
    const formData = new FormData()
    formData.set("return_job_id", jobId)
    formData.set("job_id", jobId)

    expect(hrReturnPath(formData)).toBe(`/hr/jobs/${jobId}`)
  })

  it("keeps candidate detail returns and safe panel fallbacks", () => {
    const candidateForm = new FormData()
    candidateForm.set("return_candidate_id", candidateId)
    expect(hrReturnPath(candidateForm)).toBe(`/hr/candidates/${candidateId}`)

    const panelForm = new FormData()
    panelForm.set("panel", "candidateSearchPanel")
    panelForm.set("job_id", jobId)
    expect(hrReturnPath(panelForm)).toBe(
      `/hr?panel=candidateSearchPanel&job=${jobId}`
    )
  })
})
