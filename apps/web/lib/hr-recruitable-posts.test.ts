import { describe, expect, it } from "vitest"

import { listRecruitableApprovedPosts } from "./hr-recruitable-posts"

const post = (postCode: string, status: string) => ({
  department: "Quality Control",
  designation: "Inspector",
  employeeCode: status === "Resigned" ? "EMP-1" : null,
  employeeName: status === "Resigned" ? "Former employee" : null,
  id: `post-${postCode}`,
  postCode,
  requirementTemplateCode: null,
  status,
  vacancyCode: postCode,
  vacancyNumber: "1",
})

describe("listRecruitableApprovedPosts", () => {
  it("includes vacant and resigned approved posts", () => {
    const result = listRecruitableApprovedPosts(
      [
        post("QC-IN-1", "Vacant"),
        post("QC-IN-2", "Resigned"),
        post("QC-IN-3", "Occupied"),
      ],
      []
    )

    expect(result.map((entry) => entry.postCode)).toEqual([
      "QC-IN-1",
      "QC-IN-2",
    ])
  })

  it("excludes a post that already has an open recruitment job", () => {
    const result = listRecruitableApprovedPosts(
      [post("QC-IN-1", "Vacant"), post("QC-IN-2", "Resigned")],
      [
        {
          applicantCount: 0,
          id: "job-1",
          jobNumber: "JOB-1",
          postCode: "QC-IN-2",
          postDate: "2026-08-06",
          status: "Open",
          targetDate: null,
          title: "Inspector / Quality Control",
          vacancyCode: "QC-IN-2",
        },
      ]
    )

    expect(result.map((entry) => entry.postCode)).toEqual(["QC-IN-1"])
  })
})
