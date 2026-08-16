import { describe, expect, it } from "vitest"

import { carriedDowntimeRows } from "./production-session-downtime"

describe("carried production downtime", () => {
  it("shows the latest shift-ended unresolved problem for a machine", () => {
    expect(
      carriedDowntimeRows([
        {
          id: "session-1",
          machineNumber: "C501",
          downtimeEvents: [
            {
              endOutcome: "shift_end_unresolved",
              endedAt: "2026-08-16T14:30:00.000Z",
              id: "downtime-1",
              reasonCode: "BD-01",
              reasonName: "Bearing failure",
              startedAt: "2026-08-16T10:30:00.000Z",
            },
          ],
        },
      ])
    ).toEqual([
      expect.objectContaining({
        eventId: "downtime-1",
        machineNumber: "C501",
        reasonName: "Bearing failure",
        state: "carried",
      }),
    ])
  })

  it("clears a carry-forward after resolution and keeps an active next-shift interval", () => {
    const unresolved = {
      endOutcome: "shift_end_unresolved",
      endedAt: "2026-08-16T14:30:00.000Z",
      id: "downtime-1",
      reasonCode: "BD-01",
      reasonName: "Bearing failure",
      startedAt: "2026-08-16T10:30:00.000Z",
    }

    expect(
      carriedDowntimeRows([
        {
          id: "session-1",
          machineNumber: "C501",
          downtimeEvents: [unresolved],
        },
        {
          id: "session-2",
          machineNumber: "C501",
          downtimeEvents: [
            {
              endOutcome: "resolved",
              endedAt: "2026-08-17T05:30:00.000Z",
              id: "downtime-2",
              reasonCode: "BD-01",
              reasonName: "Bearing failure",
              startedAt: "2026-08-17T03:00:00.000Z",
            },
          ],
        },
      ])
    ).toEqual([])

    expect(
      carriedDowntimeRows([
        {
          id: "session-1",
          machineNumber: "C501",
          downtimeEvents: [unresolved],
        },
        {
          id: "session-2",
          machineNumber: "C501",
          downtimeEvents: [
            {
              endedAt: null,
              id: "downtime-2",
              reasonCode: "BD-01",
              reasonName: "Bearing failure",
              startedAt: "2026-08-17T03:00:00.000Z",
            },
          ],
          status: "open",
        },
      ])
    ).toEqual([
      expect.objectContaining({
        eventId: "downtime-2",
        machineNumber: "C501",
        state: "open",
      }),
    ])
  })
})
