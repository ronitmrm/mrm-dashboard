import { describe, expect, it } from "vitest"

import { pageBounds } from "./page-bounds"

describe("pageBounds", () => {
  it("maps valid pages and normalizes invalid values", () => {
    expect(pageBounds("3", 25)).toEqual({ limit: 25, offset: 50, page: 3 })
    expect(pageBounds(undefined, 15)).toEqual({ limit: 15, offset: 0, page: 1 })
    expect(pageBounds("-2", 15).page).toBe(1)
    expect(pageBounds("word", 15).page).toBe(1)
  })
})
