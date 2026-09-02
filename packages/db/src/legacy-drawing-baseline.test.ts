import { describe, expect, test } from "vitest"

import { buildLegacyDrawingBaselinePlan } from "./legacy-drawing-baseline"

describe("Legacy drawing baseline migration", () => {
  test("stages register metadata even when drawing files are not available yet", () => {
    const plan = buildLegacyDrawingBaselinePlan({
      fileNames: [],
      registerRows: [
        {
          drawingNumber: "R160",
          revision: 3,
          revisionDate: new Date(2026, 2, 10),
          uid: "R160",
        },
      ],
      releasedProducts: [
        { itemId: "item-r160", organizationId: "org", uid: "R160" },
        { itemId: "item-missing", organizationId: "org", uid: "MISSING" },
      ],
    })

    expect(plan.baselines).toEqual([
      expect.objectContaining({
        drawingNumber: "R160",
        effectiveOn: "2026-03-10",
        fileName: null,
        revisionLabel: "03",
        uid: "R160",
      }),
      expect.objectContaining({
        drawingNumber: "MISSING",
        effectiveOn: "2026-09-02",
        fileName: null,
        revisionLabel: "00",
        uid: "MISSING",
      }),
    ])
    expect(plan.ready).toEqual([])
    expect(plan.missingFileUids).toEqual(["R160", "MISSING"])
  })

  test("retains current revisions, applies agreed defaults, and ignores dead Products", () => {
    const plan = buildLegacyDrawingBaselinePlan({
      fileNames: ["M1.pdf", "M986.pdf", "MISSING.dwg", "DEAD.pdf"],
      registerRows: [
        {
          drawingNumber: "M1",
          revision: 3,
          revisionDate: "2025-11-26",
          uid: "M1",
        },
        {
          drawingNumber: "M986",
          revision: "NA",
          revisionDate: "NA",
          uid: "M986",
        },
        {
          drawingNumber: "DEAD",
          revision: "NA",
          revisionDate: "NA",
          uid: "DEAD",
        },
      ],
      releasedProducts: [
        { itemId: "item-m1", organizationId: "org", uid: "M1" },
        { itemId: "item-m986", organizationId: "org", uid: "M986" },
        { itemId: "item-missing", organizationId: "org", uid: "MISSING" },
      ],
    })

    expect(plan.ready).toEqual([
      expect.objectContaining({
        drawingNumber: "M1",
        effectiveOn: "2025-11-26",
        fileName: "M1.pdf",
        revisionLabel: "03",
        revisionNumber: 3,
        uid: "M1",
      }),
      expect.objectContaining({
        effectiveOn: "2026-06-07",
        fileName: "M986.pdf",
        revisionLabel: "00",
        revisionNumber: 0,
        uid: "M986",
      }),
      expect.objectContaining({
        drawingNumber: "MISSING",
        effectiveOn: "2026-09-02",
        fileName: "MISSING.dwg",
        revisionLabel: "00",
        revisionNumber: 0,
        uid: "MISSING",
      }),
    ])
    expect(plan.ignoredRegisterUids).toEqual(["DEAD"])
    expect(plan.unmatchedFileNames).toEqual(["DEAD.pdf"])
    expect(plan.missingFileUids).toEqual([])
  })
})
