import { describe, expect, test } from "vitest"

import {
  createBehaviorFingerprint,
  normalizeBehaviorSnapshot,
} from "./behavior-parity-oracle"

const normalizationFixture = {
  version: "v1",
  observable: {
    auditEvents: [
      { ordinal: 1, event: "assigned" },
      { ordinal: 2, event: "interview-scheduled" },
    ],
    coverage: { available: 201, limit: 200, returned: 200, truncated: true },
    failures: ["validation", "authorization", "conflict", "missing-record"],
  },
  volatile: {
    generatedIdentifiers: { run: "fixture-run" },
    timestamps: { capturedAt: "2026-08-08T00:00:00.000Z" },
  },
} as const

describe("behavior-parity oracle", () => {
  test("normalizes only declared volatile fields without changing business order", () => {
    const capture = {
      version: "v1",
      observable: {
        dashboard: { floors: ["CONVENTIONAL", "CNC", "FORGING"] },
        auditEvents: [
          { subject: "candidate-1", event: "assigned" },
          { subject: "candidate-1", event: "interview-scheduled" },
        ],
        performance: { statementCount: 6 },
      },
      volatile: {
        generatedIdentifiers: { dashboardRun: "run-42" },
        timestamps: { refreshedAt: "2026-08-08T12:00:00.000Z" },
        providerPlanCosts: { dashboard: 0.03 },
      },
    } as const

    expect(normalizeBehaviorSnapshot(capture)).toEqual({
      observable: capture.observable,
      version: "v1",
    })
  })

  test("is stable for the versioned fixture but detects order and failure changes", () => {
    const baseline = createBehaviorFingerprint(normalizationFixture)

    expect(baseline.version).toBe("v1")
    expect(baseline.digest).toBe(
      "af37a958c70ee92c277211e0b0f0418d2830ef3a1521b9a33e69e171b0b08a8f"
    )
    expect(createBehaviorFingerprint(normalizationFixture)).toEqual(baseline)
    expect(
      createBehaviorFingerprint({
        ...normalizationFixture,
        volatile: { timestamps: { capturedAt: "2026-08-09T00:00:00.000Z" } },
      }).digest
    ).toBe(baseline.digest)
    expect(
      createBehaviorFingerprint({
        ...normalizationFixture,
        observable: {
          ...normalizationFixture.observable,
          auditEvents: [
            ...normalizationFixture.observable.auditEvents,
          ].reverse(),
        },
      }).digest
    ).not.toBe(baseline.digest)
    expect(
      createBehaviorFingerprint({
        ...normalizationFixture,
        observable: {
          ...normalizationFixture.observable,
          failures: ["infrastructure"],
        },
      }).digest
    ).not.toBe(baseline.digest)
  })
})
