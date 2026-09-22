import { describe, expect, it } from "vitest"

import {
  firstPieceReportView,
  qualityDowntimeRestartTasks,
} from "./quality-control-workspace"

describe("quality control workspace", () => {
  it("keeps QC-started open downtime in the quality task queue", () => {
    expect(
      qualityDowntimeRestartTasks([
        {
          id: "session-qc",
          status: "open",
          machineNumber: "CNC-40",
          jobCardNumber: "P2132",
          partCode: "R131",
          downtimeEvents: [
            {
              id: "downtime-qc",
              enteredRole: "quality",
              reasonName: "Quality hold",
              startedAt: "2026-09-22T10:00:00.000Z",
            },
          ],
        },
        {
          id: "session-machinist",
          status: "open",
          downtimeEvents: [{ enteredRole: "machinist" }],
        },
        {
          id: "session-closed",
          status: "closed",
          downtimeEvents: [{ enteredRole: "quality" }],
        },
      ])
    ).toEqual([
      expect.objectContaining({
        eventId: "downtime-qc",
        machineNumber: "CNC-40",
        sessionId: "session-qc",
      }),
    ])
  })

  it("turns a saved first-piece payload into a reviewable report", () => {
    expect(
      firstPieceReportView({
        _id: "database-row-id",
        key: "p2132|r131|1|1|cnc-40|fpi",
        reportId: "p2132|r131|1|1|cnc-40|fpi",
        jcNo: "P2132",
        partCode: "R131",
        machine: "CNC-40",
        optionNumber: "1",
        setupNo: "1",
        createdAt: "2026-09-21T13:19:00.000Z",
        approvedBy: "QC-12",
        status: "Approved",
        dimensions: [
          {
            parameterCode: "P1",
            parameterName: "Rod Diameter",
            specification: "30.00",
            tolerancePlus: "0.25",
            toleranceMinus: "0.25",
            readings: [29.97, 30, 30.02, 29.99, 30.01],
          },
          {
            parameterCode: "P2",
            parameterName: "Head Diameter",
            specification: "30.00",
            tolerancePlus: "0.25",
            toleranceMinus: "0.25",
            readings: [30, 30.01, 30.3, 30.02, 30],
          },
        ],
      })
    ).toEqual({
      approvedBy: "QC-12",
      inspectedAt: "2026-09-21T13:19:00.000Z",
      id: "p2132|r131|1|1|cnc-40|fpi",
      jobCardNumber: "P2132",
      machineNumber: "CNC-40",
      optionNumber: "1",
      partCode: "R131",
      remark: "",
      setupNumber: "1",
      status: "Approved",
      dimensions: [
        {
          code: "P1",
          inputType: "",
          name: "Rod Diameter",
          readings: ["29.97", "30", "30.02", "29.99", "30.01"],
          readingResults: ["OK", "OK", "OK", "OK", "OK"],
          result: "OK",
          specification: "30.00",
          tolerance: "+0.25 / -0.25",
          toleranceMinus: "0.25",
          tolerancePlus: "0.25",
        },
        {
          code: "P2",
          inputType: "",
          name: "Head Diameter",
          readings: ["30", "30.01", "30.3", "30.02", "30"],
          readingResults: ["OK", "OK", "Not OK", "OK", "OK"],
          result: "Not OK",
          specification: "30.00",
          tolerance: "+0.25 / -0.25",
          toleranceMinus: "0.25",
          tolerancePlus: "0.25",
        },
      ],
      result: "Not OK",
    })
  })
})
