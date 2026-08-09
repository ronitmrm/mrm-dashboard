import { describe, expect, test } from "vitest"

import {
  OPERATIONAL_LIST_PAGE_SIZE,
  boundedOperationalRows,
} from "./bounded-operational-rows"

describe("bounded operational rows", () => {
  test("keeps one page and reports a sentinel row", () => {
    const input = Array.from(
      { length: OPERATIONAL_LIST_PAGE_SIZE + 1 },
      (_, index) => index
    )

    expect(boundedOperationalRows(input)).toEqual({
      hasMore: true,
      rows: input.slice(0, OPERATIONAL_LIST_PAGE_SIZE),
    })
  })

  test("does not report overflow at the page boundary", () => {
    const input = Array.from(
      { length: OPERATIONAL_LIST_PAGE_SIZE },
      (_, index) => index
    )

    expect(boundedOperationalRows(input)).toEqual({
      hasMore: false,
      rows: input,
    })
  })
})
