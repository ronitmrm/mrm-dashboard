import { expect, test } from "vitest"
import { groupWorkloadBlockers } from "./order-acceptance-review"

test("groups shared workload checks into actions with job and product references", () => {
  const capacity = "P1093: existing work does not fit the planning horizon."
  const groups = groupWorkloadBlockers(
    [capacity, capacity, "P2286: Missing or ambiguous cycle time: setup 2"],
    [
      {
        id: "P2286",
        part: "M302",
        option: "1",
        quantity: 100,
        rmDate: "",
        operations: [],
        issue: "",
      },
    ]
  )
  expect(groups.map((group) => [group.title, group.rows.length])).toEqual([
    ["Existing jobs need more machining time", 1],
    ["Product masters need attention", 1],
  ])
  expect(groups[1]?.rows[0]).toMatchObject({ job: "P2286", part: "M302" })
  expect(groups[1]?.action).toContain("Part Readiness")
})
