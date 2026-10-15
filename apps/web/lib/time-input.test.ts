import { expect, test } from "vitest"
import { formatTimeInput } from "@workspace/ui/lib/time-input"

test("normalizes pasted time digits while preserving the hour-minute separator", () => {
  expect(["1", "19", "193", "1934"].map(formatTimeInput)).toEqual([
    "1",
    "19:",
    "19:3",
    "19:34",
  ])
  expect(formatTimeInput("19:34")).toBe("19:34")
})

test("allows clearing and limits input to hour and minute digits", () => {
  expect(formatTimeInput("")).toBe("")
  expect(formatTimeInput("ab193456")).toBe("19:34")
})
