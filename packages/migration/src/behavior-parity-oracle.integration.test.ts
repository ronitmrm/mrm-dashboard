import { createHash } from "node:crypto"

import { describe, expect, test } from "vitest"

import {
  createBehaviorFingerprint,
  type BehaviorCapture,
  type BehaviorSnapshot,
} from "./behavior-parity-oracle"
import expectedFingerprint from "./test-fixtures/behavior-parity-fingerprint.v1.json"
import { captureCanonicalBehaviorParityFixture } from "./test-fixtures/behavior-parity-postgres"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const recruitmentAssignmentMetadataKeys = new Set([
  "commandId",
  "commandOrdinal",
  "postId",
  "rowNumber",
  "selectionOrdinal",
  "targetCode",
  "targetType",
])

function stagingComparableCapture(capture: BehaviorCapture): BehaviorCapture {
  // The immutable staging fingerprint predates durable recruitment command order.
  // Remove only that evidence and restore its legacy business-key comparison order.
  const observable = structuredClone(capture.observable) as Record<
    string,
    unknown
  >
  const transactions = observable.auditEvidence as Array<{
    events: Array<Record<string, unknown>>
  }>
  for (const transaction of transactions) {
    const assignmentEventIndexes: number[] = []
    for (const [eventIndex, event] of transaction.events.entries()) {
      const eventType = String(event.eventType ?? "")
      if (
        eventType !== "recruitment.application.assigned" &&
        !eventType.startsWith("recruitment.employee.")
      ) {
        continue
      }
      assignmentEventIndexes.push(eventIndex)
      const metadata = { ...(event.metadata as Record<string, unknown>) }
      for (const key of recruitmentAssignmentMetadataKeys) {
        delete metadata[key]
      }
      event.inputOrder = null
      event.metadata = metadata
    }
    const legacyComparableEvents = assignmentEventIndexes
      .map((index) => transaction.events[index]!)
      .sort((left, right) => {
        const leftKey = `${left.eventType}:${left.subject}`
        const rightKey = `${right.eventType}:${right.subject}`
        return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1
      })
    assignmentEventIndexes.forEach((eventIndex, index) => {
      transaction.events[eventIndex] = legacyComparableEvents[index]!
    })
  }
  return { ...capture, observable: observable as BehaviorSnapshot }
}

describe("real-PostgreSQL behavior-parity oracle", () => {
  test("captures the production-like fixture with a repeatable fingerprint", async () => {
    const firstCapture = await captureCanonicalBehaviorParityFixture({
      connectionString,
    })
    const secondCapture = await captureCanonicalBehaviorParityFixture({
      connectionString,
    })
    const first = createBehaviorFingerprint(firstCapture)
    const second = createBehaviorFingerprint(secondCapture)
    const stagingComparable = createBehaviorFingerprint(
      stagingComparableCapture(firstCapture)
    )

    expect(second).toEqual(first)
    expect(first.version).toBe(expectedFingerprint.version)
    expect(first.digest).toBe(expectedFingerprint.candidateDigest)
    expect(stagingComparable.digest).toBe(expectedFingerprint.digest)
    expect(firstCapture.observable).toMatchObject({
      authorization: {
        afterRevocation: [],
        beforeRevocation: ["planning.plan.read"],
        postgresAuthoritativeAfterAccelerationFailure: [],
        sensitiveCapabilityDecision: false,
      },
      commercial: {
        completeEcnGraph: ["P-001->P-002", "P-001->P-003", "P-002->P-004"],
        customerPage: { returned: 15, total: 16 },
        enquiryCoverage: { available: 402, returned: 200 },
        engineeringChange: {
          designStatus: "Pending Product Costing",
          finalStatus: "Completed",
          listedStatuses: ["Completed"],
        },
        productPage: { returned: 25, total: 27 },
        purchaseOrder: {
          cancelledStatus: "Cancelled",
        },
        workflow: {
          attachments: ["oracle-drawing.pdf"],
          costingStatus: "Product Costing",
          designStatus: "Not Started",
          followupStatus: "Completed",
          handoverStatus: "Handed Over",
        },
      },
      dashboard: {
        floorIsolation: [
          { requested: "conventional", returned: "conventional" },
          { requested: "cnc", returned: "cnc" },
          { requested: "forging", returned: "forging" },
        ],
        sourceCoverage: {
          dataEntries: {
            available: 1002,
            groups: {
              machine_master: {
                available: 1002,
                limit: 1000,
                returned: 1000,
                truncated: true,
              },
            },
            returned: 1000,
            truncated: true,
            truncatedGroups: ["machine_master"],
          },
        },
        unchangedPayloadOmitted: true,
      },
      failures: {
        categories: [
          "validation",
          "conflict",
          "missing-record",
          "authorization",
          "infrastructure",
        ],
        customerFailuresAtomic: true,
        invalidCandidateBulkLeavesNoPartialWrites: true,
        invalidWorkbookLeavesNoPartialWrites: true,
      },
      productionFloors: ["conventional", "conventional-02", "cnc", "forging"],
      quality: {
        active_production_cards: 1,
        first_piece_readings: 1,
        first_piece_samples: 5,
        hourly_readings: 1,
        pause_events: 1,
        production_entries: 1,
        schedule_order: ["ORACLE-JC-1", "ORACLE-JC-2"],
      },
      recruitment: {
        approvedPostStates: [
          "Vacant",
          "Appointed",
          "Occupied",
          "Resigned",
          "Inactive",
        ],
        candidateBulk: {
          inputOrder: [
            "Repeat Candidate",
            "Bulk Candidate B",
            "Bulk Candidate C",
          ],
          resultMembership: [
            "Bulk Candidate B",
            "Bulk Candidate C",
            "Repeat Candidate",
          ],
        },
        invalidWorkbookAtomic: true,
        lockedRound: {
          error: "The next required round is Screening Round.",
          leavesNoPartialWrites: true,
        },
        repeatApplicationStatuses: ["Approved", "Assigned"],
        sequentialInterviewRounds: [
          {
            questionCount: 5,
            roundName: "Screening Round",
            status: "Approved",
          },
          {
            questionCount: 5,
            roundName: "Technical Round",
            status: "Approved",
          },
          {
            questionCount: 5,
            roundName: "HR Round",
            status: "Approved",
          },
        ],
        validWorkbook: {
          affectedPosts: [
            { employeeCode: "EMP-WORKBOOK", postCode: "POST-7" },
            { employeeCode: "EMP-WORKBOOK-2", postCode: "POST-8" },
          ],
          assignmentCount: 2,
          inputRowOrder: [
            { rowNumber: 2, targetCode: "POST-7" },
            { rowNumber: 3, targetCode: "POST-8" },
          ],
        },
        vacancyCounts: {
          candidates: 3,
          interviews: 3,
          openJobs: 1,
          posts: 8,
          templates: 0,
          vacantPosts: 2,
        },
        workspaceNextRounds: [
          "Screening Round",
          "Technical Round",
          "HR Round",
          null,
        ],
      },
      refresh: {
        duplicateHintHarmless: true,
        failedState: { stalePayloadRetained: true, status: "failed" },
        initialState: { payloadAbsent: true, status: "idle" },
        outboxPublished: "published",
        pendingState: { payloadAbsent: true, status: "pending" },
        redisLoss: { postgresPayloadRetained: true, status: "retrying" },
        restart: { recoveredJob: true, status: "processed" },
        retry: {
          attempt: 1,
          postgresPayloadRetained: true,
          status: "retrying",
        },
        successfulRun: { attempts: 1, status: "processed", version: 1 },
        versionAfterRestart: 2,
      },
    })
    const dashboard = (firstCapture.observable as Record<string, unknown>)
      .dashboard as {
      floorIsolation: Array<{
        machineMasterRows: number
        requested: string
        state: { productionFloorCode: string }
      }>
    }
    expect(
      dashboard.floorIsolation.reduce(
        (total, floor) => total + floor.machineMasterRows,
        0
      )
    ).toBe(1003)
    expect(
      dashboard.floorIsolation.map((floor) => ({
        requested: floor.requested,
        returned: floor.state.productionFloorCode,
      }))
    ).toEqual([
      { requested: "conventional", returned: "conventional" },
      { requested: "cnc", returned: "cnc" },
      { requested: "forging", returned: "forging" },
    ])
    const normalizedDashboard = (
      (first.normalized as Record<string, unknown>).observable as Record<
        string,
        unknown
      >
    ).dashboard as typeof dashboard
    expect(
      createHash("sha256")
        .update(
          JSON.stringify(
            normalizedDashboard.floorIsolation.map(({ state, ...floor }) => ({
              ...floor,
              state: Object.fromEntries(
                Object.entries(state).filter(
                  ([key]) => key !== "sourceWatermark"
                )
              ),
            }))
          )
        )
        .digest("hex")
    ).toBe("1f7b727e01c5e827fdca2281cdfb76b6b6c6b031fc0dfb17614793a7f40dddda")
    expect(
      createHash("sha256")
        .update(
          JSON.stringify(
            normalizedDashboard.floorIsolation.map(({ state, ...floor }) => ({
              ...floor,
              state: Object.fromEntries(
                Object.entries(state).filter(
                  ([key]) =>
                    key !== "sourceCoverage" && key !== "sourceWatermark"
                )
              ),
            }))
          )
        )
        .digest("hex")
    ).toBe("8668e8459482aea21d7a4964ca38ab2b22d140a974e336454f04307b3c495a06")

    const observable = firstCapture.observable as Record<string, unknown>
    const commercial = observable.commercial as {
      operationalQueues: Record<
        string,
        { available: number; limit: number; returned: number; rows: unknown[] }
      >
      purchaseOrder: {
        listedBeforeCancellation: Array<{ poNumber: string; status: string }>
      }
    }
    expect(commercial.purchaseOrder.listedBeforeCancellation).toHaveLength(201)
    expect(commercial.purchaseOrder.listedBeforeCancellation[0]).toEqual({
      poNumber: "ORACLE-PO-1",
      status: "Imported",
    })
    expect(
      Object.fromEntries(
        Object.entries(commercial.operationalQueues).map(([name, queue]) => [
          name,
          {
            available: queue.available,
            limit: queue.limit,
            returned: queue.returned,
          },
        ])
      )
    ).toMatchObject({
      bulkRevisions: { available: 201, returned: 201 },
      correctionCandidates: { available: 201, returned: 201 },
      costing: { available: 402, returned: 402 },
      design: { available: 201, returned: 201 },
      followups: { available: 201, returned: 200 },
      orders: { available: 201, returned: 201 },
      pricingCorrections: { available: 201, returned: 201 },
      salesCandidates: { available: 252, limit: 50, returned: 50 },
      salesClarification: { available: 201, returned: 201 },
      salesHandover: { available: 201, returned: 201 },
      salesQuoteReady: { available: 201, returned: 201 },
      salesSentQuotes: { available: 51, limit: 50, returned: 50 },
      technicalReview: { available: 402, returned: 402 },
    })
    const auditTransactions = observable.auditEvidence as Array<{
      events: unknown[]
      transactionOrder: number
    }>
    expect(auditTransactions.map((entry) => entry.transactionOrder)).toEqual(
      auditTransactions.map((_, index) => index)
    )
    expect(auditTransactions.flatMap((entry) => entry.events)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: "oracle-user",
          after: expect.any(Object),
          before: expect.any(Object),
          eventType: expect.any(String),
          subject: expect.any(String),
        }),
      ])
    )
    const normalizedAuditTransactions = (
      (first.normalized as Record<string, unknown>).observable as Record<
        string,
        unknown
      >
    ).auditEvidence as Array<{
      events: Array<{
        eventType: string
        inputOrder: number | null
        metadata: Record<string, unknown>
        subject: string
      }>
    }>
    const candidateBulkAudit = normalizedAuditTransactions
      .map((transaction) =>
        transaction.events.filter(
          (event) => event.eventType === "recruitment.application.assigned"
        )
      )
      .find(
        (events) =>
          events.length === 3 &&
          events.some(
            (event) =>
              event.subject === "recruitment.applications:Repeat Candidate"
          )
      )
    expect(candidateBulkAudit).toEqual([
      expect.objectContaining({
        inputOrder: 0,
        metadata: expect.objectContaining({
          commandId: "<generated-id>",
          commandOrdinal: 0,
          selectionOrdinal: 0,
        }),
        subject: "recruitment.applications:Repeat Candidate",
      }),
      expect.objectContaining({
        inputOrder: 1,
        metadata: expect.objectContaining({
          commandId: "<generated-id>",
          commandOrdinal: 1,
          selectionOrdinal: 1,
        }),
        subject: "recruitment.applications:Bulk Candidate B",
      }),
      expect.objectContaining({
        inputOrder: 2,
        metadata: expect.objectContaining({
          commandId: "<generated-id>",
          commandOrdinal: 2,
          selectionOrdinal: 2,
        }),
        subject: "recruitment.applications:Bulk Candidate C",
      }),
    ])
  }, 120_000)
})
