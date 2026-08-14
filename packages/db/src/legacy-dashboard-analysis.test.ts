import { describe, expect, test } from "vitest"

import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"

describe("legacy dashboard route selections", () => {
  test("recognizes the PostgreSQL planning payload after an option is saved", () => {
    const createdAt = "2026-08-12T10:00:00.000Z"
    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "MRM",
      productionEntries: [],
      dataEntries: [
        {
          entryType: "work_order",
          createdAt,
          payload: {
            "JC NO.": "JC-M2B-1",
            "PART CODE": "M2B",
            "ORD. PCS.": 4,
          },
        },
        {
          entryType: "rm_inward",
          createdAt,
          payload: {
            jcNo: "JC-M2B-1",
            partCode: "M2B",
            rmPoNo: "RM-1",
          },
        },
        ...["1", "2"].map((optionNumber) => ({
          entryType: "route",
          createdAt,
          payload: {
            "PART NO": "M2B",
            "OPTION NUMBER": optionNumber,
            "SETUP NO.": 1,
            "SETUP NAME": `Setup ${optionNumber}`,
          },
        })),
      ],
      routeSelections: [
        {
          createdAt,
          jobCardNumber: "JC-M2B-1",
          routeCode: "1",
        },
      ],
    })

    expect(snapshot.productionControl).toMatchObject({
      routeSelectionRequired: [],
      jobCardStatusTiles: [{
        jcNo: "JC-M2B-1",
        optionNumber: "1",
        optionSource: "Planner selected",
        routeStatus: "Ready",
      }],
    })
  })
})
