import { beforeAll, describe, expect, it } from "vitest"

import {
  readCandidateSchemaContract,
  validateManagedStagingEnvelope,
} from "./managed-staging-envelope"

const digest = (character: string) => character.repeat(64)
let schemaContract: Awaited<ReturnType<typeof readCandidateSchemaContract>>

beforeAll(async () => {
  schemaContract = await readCandidateSchemaContract()
})
const latency = (milliseconds: number) => ({
  maximum: milliseconds,
  p50: milliseconds,
  p95: milliseconds,
  p99: milliseconds,
  samples: Array.from({ length: 30 }, () => milliseconds),
})
const plan = () => ({
  externalDisk: false,
  highVolumeSequentialScans: [] as string[],
  localBlocks: { dirtied: 0, hit: 0, read: 0, written: 0 },
  nodeTypes: ["Index Scan"],
  queryFingerprint: digest("9"),
  sharedBlocks: { dirtied: 0, hit: 12, read: 0, written: 0 },
  temporaryBlocks: { read: 0, written: 0 },
  wal: { bytes: 0, fullPageImages: 0, records: 0 },
})
const operation = (milliseconds: number, statements = 1) => ({
  latencyMs: latency(milliseconds),
  packets: {
    httpRequest: 128,
    httpResponse: 512,
    postgresRequest: 128,
    postgresResponse: 512,
    repositoryResponse: 512,
  },
  plans: [plan()],
  poolWaiters: 0,
  rows: 1,
  statements,
})

function validEnvelope() {
  return {
    artifacts: {
      behaviorFingerprint:
        "947121f5774519864ffd94ab096aff2078ea85962d05f97657c2f71146264c9c",
      schemaChecksumsDigest: schemaContract.checksumsDigest,
      schemaHead: schemaContract.head,
      sourceCommit: "a".repeat(40),
      web: {
        candidateDigest: digest("3"),
        previewDeploymentHash: digest("4"),
        promotedDigest: digest("3"),
      },
      worker: {
        candidateDigest: digest("5"),
        previewArtifactHash: digest("6"),
        promotedDigest: digest("5"),
      },
    },
    benchmark: {
      concurrency: 4,
      measuredSamples: 30,
      postgresComputeUnits: 1,
      warmupSamples: 5,
    },
    capturedAt: "2026-08-09T12:00:00.000Z",
    coverage: {
      boundedCollections: [
        {
          available: 201,
          capPlusOneProven: true,
          limit: 200,
          name: "commercial.enquiries",
          returned: 200,
          searchBeforeLimitProven: true,
          truncated: true,
        },
      ],
      completeExports: [
        {
          canonicalFingerprint: digest("7"),
          exportedFingerprint: digest("7"),
          exportedRows: 501,
          maximumPageRows: 500,
          name: "commercial.enquiry-register",
          pageLimit: 500,
          sourceRows: 501,
        },
      ],
      scopeManifestDigest: digest("8"),
    },
    environment: "controlled-staging",
    freshness: {
      committedWriteToReadModelMs: latency(9_000),
      listenerRecovery: {
        durableWorkRecovered: true,
        recoveredWithinMs: 29_000,
      },
      notificationToWorkerClaimMs: latency(1_500),
      sseHintToCanonicalReadMs: latency(1_500),
    },
    health: {
      connectionHeadroomPercent: 30,
      failedRefreshJobs: 0,
      pendingRefreshJobs: 0,
      pendingOutbox: 0,
      poolWaiters: 0,
      retryingOutbox: 0,
    },
    operations: {
      authorization: {
        ...operation(40, 2),
        completeGrantReads: 1,
        crossRequestRevocationGrace: 0,
        sessionReads: 1,
      },
      commercialDesign: operation(200, 5),
      commercialEcnGraph: operation(200, 6),
      commercialEnquiries: operation(200, 6),
      commercialSales: operation(200, 6),
      commercialSearch: operation(20),
      dashboardChanged: operation(700),
      dashboardSource: operation(90),
      dashboardUnchanged: operation(200),
      recruitmentBulkHundred: operation(450, 6),
      recruitmentBulkOne: operation(400, 5),
      workerIdleMinute: operation(10, 4),
    },
    redacted: true,
    version: 1,
  }
}

describe("managed staging envelope", () => {
  it("accepts a complete redacted record within every hard threshold", async () => {
    const result = await validateManagedStagingEnvelope(validEnvelope())

    expect(result.record.environment).toBe("controlled-staging")
    expect(result.recordDigest).toMatch(/^[a-f0-9]{64}$/)
  })

  it("fails closed when a required metric is missing", async () => {
    const envelope = validEnvelope()
    Reflect.deleteProperty(envelope.operations.dashboardSource.latencyMs, "p99")

    await expect(validateManagedStagingEnvelope(envelope)).rejects.toThrow(
      /operations\.dashboardSource\.latencyMs\.p99/
    )
  })

  it.each([
    [
      "latency",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.operations.commercialSearch.latencyMs = latency(26)
      },
      /commercialSearch.*p95.*25/,
    ],
    [
      "temporary blocks",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.operations.dashboardSource.plans[0]!.temporaryBlocks.written = 1
      },
      /temporary blocks written.*0/,
    ],
    [
      "pool waiters",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.operations.commercialSales.poolWaiters = 1
      },
      /pool waiters.*0/,
    ],
    [
      "high-volume sequential scans",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.operations.commercialSearch.plans[0]!.highVolumeSequentialScans =
          ["sales.enquiry_items"]
      },
      /high-volume sequential scan/,
    ],
    [
      "freshness tail",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.freshness.committedWriteToReadModelMs = latency(30_001)
      },
      /committedWriteToReadModelMs.*p99.*30000/,
    ],
    [
      "recruitment statement growth",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.operations.recruitmentBulkOne.statements = 1
      },
      /statement growth.*1/,
    ],
    [
      "rebuilt promotion",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.artifacts.web.promotedDigest = digest("0")
      },
      /web artifact was rebuilt/,
    ],
    [
      "behavior fingerprint",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.artifacts.behaviorFingerprint = digest("0")
      },
      /behavior fingerprint differs/,
    ],
    [
      "schema head",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.artifacts.schemaHead = "0043_commercial_search_indexes.sql"
      },
      /schema head differs/,
    ],
    [
      "schema checksums",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.artifacts.schemaChecksumsDigest = digest("0")
      },
      /schema checksums differ/,
    ],
    [
      "incomplete export",
      (envelope: ReturnType<typeof validEnvelope>) => {
        envelope.coverage.completeExports[0]!.exportedRows = 500
      },
      /exportedRows.*sourceRows/,
    ],
  ])(
    "rejects an envelope that exceeds the %s gate",
    async (_, mutate, error) => {
      const envelope = validEnvelope()
      mutate(envelope)

      await expect(validateManagedStagingEnvelope(envelope)).rejects.toThrow(
        error
      )
    }
  )

  it("rejects unredacted or unexpected fields", async () => {
    const envelope = {
      ...validEnvelope(),
      databaseUrl: "postgresql://secret@provider.example/database",
    }

    await expect(validateManagedStagingEnvelope(envelope)).rejects.toThrow(
      /unexpected field databaseUrl/
    )
  })
})
