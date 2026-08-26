import { describe, expect, it } from "vitest"

import {
  combinedPostFilterOptions,
  filterCombinedPosts,
} from "./combined-post-picker-state"

const posts = [
  {
    department: "Accounts & Finance",
    designation: "Assistant",
    id: "post-1",
    postCode: "AF-AS-1",
    status: "Vacant",
  },
  {
    department: "Accounts & Finance",
    designation: "Hod",
    id: "post-2",
    postCode: "AF-HO-1",
    status: "Occupied",
  },
  {
    department: "Assembly & Marking",
    designation: "Assistant",
    id: "post-3",
    postCode: "AM-AS-1",
    status: "Vacant",
  },
]

describe("combined approved-post picker filters", () => {
  it("filters posts by the combined department and designation column", () => {
    expect(combinedPostFilterOptions(posts)).toEqual({
      departmentDesignation: [
        "Accounts & Finance / Assistant",
        "Accounts & Finance / Hod",
        "Assembly & Marking / Assistant",
      ],
      postCode: ["AF-AS-1", "AF-HO-1", "AM-AS-1"],
      status: ["Occupied", "Vacant"],
    })

    expect(
      filterCombinedPosts(posts, {
        departmentDesignation: ["Accounts & Finance / Hod"],
        postCode: null,
        status: null,
      }).map((post) => post.postCode)
    ).toEqual(["AF-HO-1"])
  })
})
