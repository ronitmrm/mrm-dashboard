import { describe, expect, it } from "vitest"

import { executeBoundedImport } from "./bounded-import"

describe("bounded browser imports", () => {
  it("runs a machine-sized batch with bounded concurrency", async () => {
    let active = 0
    let maximumActive = 0
    const completed: number[] = []

    await executeBoundedImport(
      Array.from({ length: 8 }, (_, index) => index),
      async (row) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        completed.push(row)
        active -= 1
      },
      4,
    )

    expect(maximumActive).toBe(4)
    expect(completed.sort((left, right) => left - right)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
  })
})
