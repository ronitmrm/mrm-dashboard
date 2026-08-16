import { describe, expect, test } from "vitest"

import { plannerInterruptionRequirement } from "./planner-interruption-settlement"

describe("planner interruption settlement", () => {
  const weightSession = {
    hasOpenDowntime: false,
    measurementMethod: "weight" as const,
    sessionReference: "ADD501-20260816-01",
  }

  test("requires the canonical measurement workflow before moving running work", () => {
    expect(
      plannerInterruptionRequirement({
        keepsWorkOnMachine: false,
        session: weightSession,
      })
    ).toEqual({
      blocked: true,
      message:
        "Close Production Session ADD501-20260816-01 using Weight at the actual interruption time, then retry this Planner Action.",
    })
  })

  test("requires downtime instead of closing a delayed same-machine session", () => {
    expect(
      plannerInterruptionRequirement({
        keepsWorkOnMachine: true,
        session: weightSession,
      })
    ).toEqual({
      blocked: true,
      message:
        "Start downtime on Production Session ADD501-20260816-01 at the actual interruption time, then retry this Planner Action.",
    })

    expect(
      plannerInterruptionRequirement({
        keepsWorkOnMachine: true,
        session: { ...weightSession, hasOpenDowntime: true },
      })
    ).toEqual({ blocked: false })
  })

  test("does not invent a settlement for queued or already settled work", () => {
    expect(
      plannerInterruptionRequirement({
        keepsWorkOnMachine: false,
        session: null,
      })
    ).toEqual({ blocked: false })
  })
})
