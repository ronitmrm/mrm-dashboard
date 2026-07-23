import { describe, expect, it } from "vitest"

import { parseRecruitmentArchive } from "./recruitment-json"

const emptyArchive = {
  assignments: [],
  candidates: [],
  combinedRoleGroups: [],
  departments: [],
  designations: [],
  events: [],
  interviews: [],
  jobs: [],
  postMasters: [],
  requirementTemplates: [],
}

describe("parseRecruitmentArchive", () => {
  it("retains attributable source identifiers", () => {
    const archive = parseRecruitmentArchive({
      ...emptyArchive,
      departments: [{ code: "HR", id: "DEPT-1", name: "Human Resources" }],
    })

    expect(archive.departments).toEqual([
      { code: "HR", id: "DEPT-1", name: "Human Resources" },
    ])
  })

  it("rejects rows that cannot be attributed to a source identifier", () => {
    expect(() =>
      parseRecruitmentArchive({
        ...emptyArchive,
        candidates: [{ name: "Missing id" }],
      })
    ).toThrow("candidates[0] must be an object with an id")
  })
})
