import { expect, test } from "vitest"

import { normalizeUserEnteredPayload } from "./user-entry-text"

test("preserves the raw-material rejection planning action enum", () => {
  expect(
    normalizeUserEnteredPayload({
      planningAction: "wait_for_replacement",
    })
  ).toEqual({
    planningAction: "wait_for_replacement",
  })
})
