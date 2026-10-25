import { describe, expect, it } from "vitest"
import {
  buildQualityReport,
  qualityHourlyCoverage,
  type QualityReportSource,
} from "./quality-report-domain"

describe("quality reports", () => {
  it("carries pending requests into each day and shift until resolution, without projecting future backlog", () => {
    const source: QualityReportSource = {
      production: [],
      requests: [
        {
          id: "pending-21",
          requestedAt: "2026-10-21T09:00:00+05:30",
          shift: "A",
        },
        {
          id: "pending-24",
          requestedAt: "2026-10-24T09:00:00+05:30",
          shift: "B",
        },
        {
          id: "approved-25",
          requestedAt: "2026-10-22T09:00:00+05:30",
          approvedAt: "2026-10-25T10:00:00+05:30",
          inspector: "QC1",
          shift: "A",
        },
      ].map((request) => ({
        approvedAt: null,
        closedAt: null,
        inspector: null,
        ...request,
      })),
      inspectors: ["QC1"],
      runs: [],
      checks: [],
      defects: [],
    }
    const result = buildQualityReport(
      source,
      "2026-10-24",
      "2026-10-26",
      "2026-10-25T12:00:00+05:30"
    )
    expect(
      result.daily.map((row) => [row.label, row.pending, row.approved])
    ).toEqual([
      ["2026-10-24", 3, 0],
      ["2026-10-25", 2, 1],
      ["2026-10-26", 0, 0],
    ])
    expect(
      result.shifts.map((row) => [row.label, row.pending, row.approved])
    ).toEqual([
      ["A", 1, 1],
      ["B", 1, 0],
    ])
    expect(result).toMatchObject({
      pendingBefore: 2,
      pendingNow: 2,
      approvals: 1,
    })
  })
  it("uses elapsed approvals, excludes closed requests, and matches completed running hours", () => {
    const source: QualityReportSource = {
      production: [
        {
          date: "2026-10-21",
          shift: "A",
          machine: "M1",
          good: 970,
          rejected: 30,
        },
      ],
      requests: [
        {
          id: "replaced",
          requestedAt: "2026-10-19T09:00:00+05:30",
          approvedAt: null,
          closedAt: "2026-10-20T10:00:00+05:30",
          inspector: null,
          shift: "A",
        },
        {
          id: "approved",
          requestedAt: "2026-10-20T20:00:00+05:30",
          approvedAt: "2026-10-21T08:00:00+05:30",
          closedAt: null,
          inspector: "QC1",
          shift: "B",
        },
        {
          id: "not-ok",
          requestedAt: "2026-10-21T09:00:00+05:30",
          approvedAt: null,
          closedAt: null,
          inspector: null,
          shift: "A",
        },
      ],
      inspectors: ["QC1", "QC2"],
      defects: [{ date: "2026-10-21", shift: "A", defect: "Burr", pieces: 30 }],
      runs: [
        {
          id: "run",
          machine: "M1",
          workOrder: "J1",
          setup: "S1",
          shift: "A",
          start: "2026-10-21T08:00:00+05:30",
          end: "2026-10-21T18:20:00+05:30",
          downtime: [],
        },
      ],
      checks: [8, 9].map((h) => ({
        machine: "M1",
        workOrder: "J1",
        setup: "S1",
        date: "2026-10-21",
        hour: `0${h}:00`,
      })),
    }
    const result = buildQualityReport(
      source,
      "2026-10-21",
      "2026-10-21",
      "2026-10-21T20:00:00+05:30"
    )
    expect(result.daily[0]).toMatchObject({
      good: 970,
      rejected: 30,
      pending: 1,
      expected: 10,
      completed: 2,
      minutes: 720,
      timed: 1,
    })
    expect(result).toMatchObject({
      pendingBefore: 1,
      pendingNow: 1,
      approvals: 1,
    })
    expect(result.inspectors.find((row) => row.label === "QC2")?.approved).toBe(
      0
    )
    expect(result.shifts.find((row) => row.label === "B")?.minutes).toBe(720)
    const historical = buildQualityReport(
      source,
      "2026-10-19",
      "2026-10-19",
      "2026-10-21T20:00:00+05:30"
    )
    expect(historical).toMatchObject({
      pendingBefore: 0,
      pendingNow: 1,
      approvals: 0,
    })
    expect(historical.daily[0]?.pending).toBe(1)
  })
  it("does not use repeated checks in one hour to fill another hour or downtime", () => {
    const run = {
      id: "run",
      machine: "M1",
      workOrder: "J1",
      setup: "S1",
      shift: "A",
      start: "2026-10-21T08:00:00+05:30",
      end: "2026-10-21T11:20:00+05:30",
      downtime: [
        {
          start: "2026-10-21T09:00:00+05:30",
          end: "2026-10-21T10:00:00+05:30",
        },
      ],
    }
    const check = {
      machine: "M1",
      workOrder: "J1",
      setup: "S1",
      date: "2026-10-21",
      hour: "08:00",
    }
    const result = qualityHourlyCoverage(
      [run],
      [check, check],
      "2026-10-21",
      "2026-10-21"
    )
    expect(result).toHaveLength(2)
    expect(result.filter((row) => row.completed)).toHaveLength(1)
  })
})
