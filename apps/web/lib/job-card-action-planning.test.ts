import { describe, expect, it } from "vitest"

import { dispatchReadyJobCards } from "./job-card-action-planning"

describe("dispatchReadyJobCards", () => {
  it("returns only undispatched Job Cards whose every planned setup is complete", () => {
    expect(
      dispatchReadyJobCards(
        [
          { dispatchStatus: "In production", jcNo: "JC-READY" },
          { dispatchStatus: "In production", jcNo: "JC-PARTIAL" },
          { dispatchStatus: "Shifted to dispatch", jcNo: "JC-DISPATCHED" },
          { dispatchStatus: "In production", jcNo: "JC-NO-PLAN" },
        ],
        [
          { jcNo: "JC-READY", runningStatus: "Complete", setupNo: "1" },
          { jcNo: "JC-READY", setupNo: "2", shopFloorStage: "item_complete" },
          { jcNo: "JC-PARTIAL", runningStatus: "Complete", setupNo: "1" },
          { jcNo: "JC-PARTIAL", runningStatus: "Running", setupNo: "2" },
          { jcNo: "JC-DISPATCHED", runningStatus: "Complete", setupNo: "1" },
        ],
      ),
    ).toEqual(["JC-READY"])
  })
})
