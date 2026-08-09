import { describe, expect, test } from "vitest"

import { listRecruitableApprovedPosts } from "./recruitment-domain"

const post = (postCode: string, status: string) => ({ postCode, status })

describe("listRecruitableApprovedPosts", () => {
  test("includes vacant and resigned posts without an open job", () => {
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

  test("excludes a post that already has an open recruitment job", () => {
    const result = listRecruitableApprovedPosts(
      [post("QC-IN-1", "Vacant"), post("QC-IN-2", "Resigned")],
      [{ postCode: "QC-IN-2", status: "Open" }]
    )

    expect(result.map((entry) => entry.postCode)).toEqual(["QC-IN-1"])
  })

  test("ignores closed jobs and jobs without an approved post", () => {
    const result = listRecruitableApprovedPosts(
      [post("QC-IN-1", "Vacant"), post("QC-IN-2", "Resigned")],
      [
        { postCode: "QC-IN-1", status: "Closed" },
        { postCode: null, status: "Open" },
      ]
    )

    expect(result.map((entry) => entry.postCode)).toEqual([
      "QC-IN-1",
      "QC-IN-2",
    ])
  })
})
