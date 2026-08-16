import { describe, expect, it } from "vitest"

import {
  productionSessionActionDefaults,
  productionSessionCarriedStartCount,
  productionSessionStartOptions,
} from "./production-session-start"

describe("production session action defaults", () => {
  it("prefills a new downtime start with the current IST time", () => {
    expect(
      productionSessionActionDefaults(
        "conventional",
        new Date("2026-08-16T10:30:00.000Z"),
        { action: "downtime" }
      ).startAt
    ).toBe("2026-08-16T16:00")
  })

  it("prefills the Conventional shift start, shift end, and close reason", () => {
    expect(
      productionSessionActionDefaults(
        "conventional",
        new Date("2026-08-16T10:30:00.000Z")
      )
    ).toEqual({
      endAt: "2026-08-16T20:00",
      endReason: "shift_end",
      startAt: "2026-08-16T08:30",
    })
  })

  it("keeps overnight CNC shift C on its starting production date", () => {
    expect(
      productionSessionActionDefaults(
        "cnc",
        new Date("2026-08-16T19:30:00.000Z")
      )
    ).toEqual({
      endAt: "2026-08-17T06:00",
      endReason: "shift_end",
      startAt: "2026-08-16T22:00",
    })
  })
})

describe("production session machine lookup", () => {
  it("selects the current planned job for each machine and attaches its open session", () => {
    const runningPlan = {
      jcNo: "JC-101",
      machine: "C501",
      partCode: "PART-1",
      runningStatus: "Running",
      setupNo: "20",
      shopFloorStage: "operator_started",
    }
    const openSession = {
      id: "session-1",
      machineNumber: "C501",
      status: "open",
    }

    expect(
      productionSessionStartOptions({
        planRows: [
          {
            jcNo: "JC-COMPLETE",
            machine: "C501",
            shopFloorStage: "item_complete",
          },
          {
            jcNo: "JC-FUTURE",
            machine: "C501",
            runningStatus: "Planned",
            shopFloorStage: "",
          },
          runningPlan,
        ],
        sessions: [openSession],
      })
    ).toEqual([
      {
        machineNumber: "C501",
        plan: runningPlan,
        session: openSession,
      },
    ])
  })

  it("offers only running machines in the Start Session dropdown", () => {
    const options = productionSessionStartOptions({
      planRows: [
        { jcNo: "JC-501", machine: "C501", runningStatus: "Running" },
        { jcNo: "JC-510", machine: "C510", runningStatus: "Planned" },
        { jcNo: "JC-D501", machine: "D501", runningStatus: "Planned" },
      ],
      sessions: [
        { id: "session-2", machineNumber: "D501", status: "open" },
      ],
    })

    expect(options.map(({ machineNumber }) => machineNumber)).toEqual([
      "C501",
      "D501",
    ])
  })

  it("carries a counter only from the immediately previous matching session", () => {
    const plan = {
      jcNo: "JC-501",
      machine: "C501",
      optionNumber: "1",
      partCode: "PART-1",
      setupNo: "20",
    }
    const matchingSession = {
      endedAt: "2026-08-16T08:00:00.000Z",
      endCount: 1250,
      jobCardNumber: "JC-501",
      machineNumber: "C501",
      measurementMethod: "counter",
      optionNumber: "1",
      partCode: "PART-1",
      setupNumber: "20",
      status: "closed",
    }

    expect(
      productionSessionCarriedStartCount(plan, [matchingSession])
    ).toBe(1250)
    expect(
      productionSessionCarriedStartCount(plan, [
        matchingSession,
        {
          ...matchingSession,
          endedAt: "2026-08-16T09:00:00.000Z",
          jobCardNumber: "JC-OTHER",
        },
      ])
    ).toBeUndefined()
  })
})
