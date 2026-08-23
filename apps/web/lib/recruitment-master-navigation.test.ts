import { describe, expect, it } from "vitest"

import {
  normalizeRecruitmentMasterKind,
  recruitmentMasterHref,
} from "./recruitment-master-navigation"

describe("HR master navigation", () => {
  it("keeps exactly one selected HR master across both workspace views", () => {
    expect(normalizeRecruitmentMasterKind("employee-assignment")).toBe(
      "employee-assignment"
    )
    expect(normalizeRecruitmentMasterKind("designation")).toBe("designation")
    expect(normalizeRecruitmentMasterKind("department")).toBe("department")
    expect(normalizeRecruitmentMasterKind("unknown")).toBe("department")

    expect(recruitmentMasterHref("dataEntry", "designation")).toBe(
      "/hr?panel=mastersPanel&masterView=dataEntry&kind=designation"
    )
    expect(recruitmentMasterHref("masterTables", "department")).toBe(
      "/hr?panel=mastersPanel&masterView=masterTables&kind=department"
    )
    expect(recruitmentMasterHref("dataEntry", "employee-assignment")).toBe(
      "/hr?panel=employeeMasterPanel&masterView=dataEntry&kind=employee-assignment"
    )
    expect(recruitmentMasterHref("masterTables", "employee-assignment")).toBe(
      "/hr?panel=employeeMasterPanel&masterView=masterTables&kind=employee-assignment"
    )
  })
})
