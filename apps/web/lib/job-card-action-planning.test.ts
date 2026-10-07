import { describe, expect, it } from "vitest"

import { dispatchReadyJobCards } from "./job-card-action-planning"

describe("dispatchReadyJobCards", () => {
  it("offers only recorded final-setup good not already dispatched", () => {
    expect(
      dispatchReadyJobCards(
        [
          { dispatchStatus: "In production", jcNo: "JC-READY", finalSetupGoodPieces: 80, dispatchAvailablePieces: 80 },
          { dispatchStatus: "Partially dispatched", jcNo: "JC-PARTIAL", finalSetupGoodPieces: 100, dispatchedPieces: 60, dispatchAvailablePieces: 40 },
          { dispatchStatus: "Shifted to dispatch", jcNo: "JC-DISPATCHED", finalSetupGoodPieces: 100, dispatchAvailablePieces: 30 },
          { dispatchStatus: "In production", jcNo: "JC-NO-GOOD", dispatchAvailablePieces: 0 },
        ],
      ),
    ).toEqual([
      { jobCard: "JC-PARTIAL", availablePieces: 40, dispatchedPieces: 60, finishedGoodPieces: 100 },
      { jobCard: "JC-READY", availablePieces: 80, dispatchedPieces: 0, finishedGoodPieces: 80 },
    ])
  })
})
