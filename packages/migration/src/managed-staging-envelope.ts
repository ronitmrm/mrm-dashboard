import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import expectedBehaviorFingerprint from "./test-fixtures/behavior-parity-fingerprint.v1.json"

type BlockEvidence = {
  dirtied: number
  hit: number
  read: number
  written: number
}

export type LatencyEvidence = {
  maximum: number
  p50: number
  p95: number
  p99: number
  samples: number[]
}

type PlanEvidence = {
  externalDisk: boolean
  highVolumeSequentialScans: string[]
  localBlocks: BlockEvidence
  nodeTypes: string[]
  queryFingerprint: string
  sharedBlocks: BlockEvidence
  temporaryBlocks: { read: number; written: number }
  wal: { bytes: number; fullPageImages: number; records: number }
}

type OperationEvidence = {
  latencyMs: LatencyEvidence
  packets: {
    httpRequest: number
    httpResponse: number
    postgresRequest: number
    postgresResponse: number
    repositoryResponse: number
  }
  plans: PlanEvidence[]
  poolWaiters: number
  rows: number
  statements: number
}

type AuthorizationEvidence = OperationEvidence & {
  completeGrantReads: number
  crossRequestRevocationGrace: number
  sessionReads: number
}

const operationNames = [
  "authorization",
  "commercialDesign",
  "commercialEcnGraph",
  "commercialEnquiries",
  "commercialSales",
  "commercialSearch",
  "dashboardChanged",
  "dashboardSource",
  "dashboardUnchanged",
  "recruitmentBulkHundred",
  "recruitmentBulkOne",
  "workerIdleMinute",
] as const

type OperationName = (typeof operationNames)[number]

export type ManagedStagingEnvelope = {
  artifacts: {
    behaviorFingerprint: string
    schemaChecksumsDigest: string
    schemaHead: string
    sourceCommit: string
    web: {
      candidateDigest: string
      previewDeploymentHash: string
      promotedDigest: string
    }
    worker: {
      candidateDigest: string
      previewArtifactHash: string
      promotedDigest: string
    }
  }
  benchmark: {
    concurrency: number
    measuredSamples: number
    postgresComputeUnits: number
    warmupSamples: number
  }
  capturedAt: string
  coverage: {
    boundedCollections: Array<{
      available: number
      capPlusOneProven: boolean
      limit: number
      name: string
      returned: number
      searchBeforeLimitProven: boolean
      truncated: boolean
    }>
    completeExports: Array<{
      canonicalFingerprint: string
      exportedFingerprint: string
      exportedRows: number
      maximumPageRows: number
      name: string
      pageLimit: number
      sourceRows: number
    }>
    scopeManifestDigest: string
  }
  environment: "controlled-staging"
  freshness: {
    committedWriteToReadModelMs: LatencyEvidence
    listenerRecovery: {
      durableWorkRecovered: boolean
      recoveredWithinMs: number
    }
    notificationToWorkerClaimMs: LatencyEvidence
    sseHintToCanonicalReadMs: LatencyEvidence
  }
  health: {
    connectionHeadroomPercent: number
    failedRefreshJobs: number
    pendingRefreshJobs: number
    pendingOutbox: number
    poolWaiters: number
    retryingOutbox: number
  }
  operations: Record<
    Exclude<OperationName, "authorization">,
    OperationEvidence
  > & { authorization: AuthorizationEvidence }
  redacted: true
  version: 1
}

type ManagedStagingConfig = {
  observability: {
    thresholds: {
      connectionHeadroomPercentMinimum: number
      failedRefreshJobs: number
      poolWaiting: number
      retryingOutbox: number
    }
  }
  performance: {
    benchmark: ManagedStagingEnvelope["benchmark"]
    freshnessMilliseconds: {
      committedWriteToReadModelP95: number
      committedWriteToReadModelP99: number
      notificationToWorkerClaimP95: number
      notificationToWorkerClaimP99: number
      sseHintToCanonicalReadP95: number
    }
    latencyMillisecondsP95: {
      authorizationDatabase: number
      commercialDatabaseWorkflow: number
      commercialSearchDatabase: number
      dashboardChangedRoute: number
      dashboardSourceDatabase: number
      dashboardUnchangedRoute: number
      recruitmentBulkDatabase: number
    }
    packetBytesMaximum: {
      commercialRepositoryResponse: number
      dashboardChangedResponse: number
      dashboardSourceDatabaseResponse: number
      dashboardUnchangedResponse: number
      recruitmentBulkRequestAndResponse: number
    }
    pollingMilliseconds: { workerSafetySweep: number }
    statementMaximum: {
      authorizationPerRequest: number
      commercialDesign: number
      commercialEcnGraph: number
      commercialEnquiries: number
      commercialSales: number
      dashboardSource: number
      dashboardState: number
      recruitmentBulkOneOrOneHundred: number
      workerIdlePerMinute: number
    }
    temporaryBlocksWrittenMaximum: number
  }
}

const configPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config/managed-staging.json"
)
const migrationsPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations"
)
const digestPattern = /^[a-f0-9]{64}$/
const commitPattern = /^[a-f0-9]{40}$/

function object(
  value: unknown,
  path: string,
  expectedFields: readonly string[]
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  const result = value as Record<string, unknown>
  for (const field of Object.keys(result)) {
    if (!expectedFields.includes(field)) {
      throw new Error(`${path}: unexpected field ${field}`)
    }
  }
  return result
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function number(value: unknown, path: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a non-negative number`)
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${path} must be an integer`)
  }
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`)
  }
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`)
  return value
}

function digest(value: unknown, path: string): string {
  const result = string(value, path)
  if (!digestPattern.test(result)) {
    throw new Error(`${path} must be a redacted SHA-256 digest`)
  }
  return result
}

function integer(value: unknown, path: string): number {
  return number(value, path, true)
}

function parseBlocks(value: unknown, path: string): BlockEvidence {
  const result = object(value, path, ["dirtied", "hit", "read", "written"])
  return {
    dirtied: integer(result.dirtied, `${path}.dirtied`),
    hit: integer(result.hit, `${path}.hit`),
    read: integer(result.read, `${path}.read`),
    written: integer(result.written, `${path}.written`),
  }
}

function nearestRank(samples: number[], percentile: number) {
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * percentile) - 1]!
}

function parseLatency(
  value: unknown,
  path: string,
  measuredSamples: number
): LatencyEvidence {
  const result = object(value, path, [
    "maximum",
    "p50",
    "p95",
    "p99",
    "samples",
  ])
  const samples = array(result.samples, `${path}.samples`).map(
    (sample, index) => number(sample, `${path}.samples[${index}]`)
  )
  if (samples.length !== measuredSamples) {
    throw new Error(
      `${path}.samples must contain exactly ${measuredSamples} measurements`
    )
  }
  const parsed = {
    maximum: number(result.maximum, `${path}.maximum`),
    p50: number(result.p50, `${path}.p50`),
    p95: number(result.p95, `${path}.p95`),
    p99: number(result.p99, `${path}.p99`),
    samples,
  }
  const expected = {
    maximum: Math.max(...samples),
    p50: nearestRank(samples, 0.5),
    p95: nearestRank(samples, 0.95),
    p99: nearestRank(samples, 0.99),
  }
  for (const key of ["maximum", "p50", "p95", "p99"] as const) {
    if (parsed[key] !== expected[key]) {
      throw new Error(`${path}.${key} does not match the recorded samples`)
    }
  }
  return parsed
}

function parsePlan(value: unknown, path: string): PlanEvidence {
  const result = object(value, path, [
    "externalDisk",
    "highVolumeSequentialScans",
    "localBlocks",
    "nodeTypes",
    "queryFingerprint",
    "sharedBlocks",
    "temporaryBlocks",
    "wal",
  ])
  const nodeTypes = array(result.nodeTypes, `${path}.nodeTypes`).map(
    (nodeType, index) => string(nodeType, `${path}.nodeTypes[${index}]`)
  )
  if (nodeTypes.length === 0) throw new Error(`${path}.nodeTypes is required`)
  const highVolumeSequentialScans = array(
    result.highVolumeSequentialScans,
    `${path}.highVolumeSequentialScans`
  ).map((relation, index) =>
    string(relation, `${path}.highVolumeSequentialScans[${index}]`)
  )
  const temporaryBlocks = object(
    result.temporaryBlocks,
    `${path}.temporaryBlocks`,
    ["read", "written"]
  )
  const wal = object(result.wal, `${path}.wal`, [
    "bytes",
    "fullPageImages",
    "records",
  ])
  return {
    externalDisk: boolean(result.externalDisk, `${path}.externalDisk`),
    highVolumeSequentialScans,
    localBlocks: parseBlocks(result.localBlocks, `${path}.localBlocks`),
    nodeTypes,
    queryFingerprint: digest(
      result.queryFingerprint,
      `${path}.queryFingerprint`
    ),
    sharedBlocks: parseBlocks(result.sharedBlocks, `${path}.sharedBlocks`),
    temporaryBlocks: {
      read: integer(temporaryBlocks.read, `${path}.temporaryBlocks.read`),
      written: integer(
        temporaryBlocks.written,
        `${path}.temporaryBlocks.written`
      ),
    },
    wal: {
      bytes: integer(wal.bytes, `${path}.wal.bytes`),
      fullPageImages: integer(wal.fullPageImages, `${path}.wal.fullPageImages`),
      records: integer(wal.records, `${path}.wal.records`),
    },
  }
}

function parseOperation(
  value: unknown,
  path: string,
  measuredSamples: number,
  authorization = false
): OperationEvidence | AuthorizationEvidence {
  const commonFields = [
    "latencyMs",
    "packets",
    "plans",
    "poolWaiters",
    "rows",
    "statements",
  ]
  const result = object(
    value,
    path,
    authorization
      ? [
          ...commonFields,
          "completeGrantReads",
          "crossRequestRevocationGrace",
          "sessionReads",
        ]
      : commonFields
  )
  const packets = object(result.packets, `${path}.packets`, [
    "httpRequest",
    "httpResponse",
    "postgresRequest",
    "postgresResponse",
    "repositoryResponse",
  ])
  const plans = array(result.plans, `${path}.plans`).map((entry, index) =>
    parsePlan(entry, `${path}.plans[${index}]`)
  )
  if (plans.length === 0) throw new Error(`${path}.plans is required`)
  const common: OperationEvidence = {
    latencyMs: parseLatency(
      result.latencyMs,
      `${path}.latencyMs`,
      measuredSamples
    ),
    packets: {
      httpRequest: integer(packets.httpRequest, `${path}.packets.httpRequest`),
      httpResponse: integer(
        packets.httpResponse,
        `${path}.packets.httpResponse`
      ),
      postgresRequest: integer(
        packets.postgresRequest,
        `${path}.packets.postgresRequest`
      ),
      postgresResponse: integer(
        packets.postgresResponse,
        `${path}.packets.postgresResponse`
      ),
      repositoryResponse: integer(
        packets.repositoryResponse,
        `${path}.packets.repositoryResponse`
      ),
    },
    plans,
    poolWaiters: integer(result.poolWaiters, `${path}.poolWaiters`),
    rows: integer(result.rows, `${path}.rows`),
    statements: integer(result.statements, `${path}.statements`),
  }
  if (!authorization) return common
  return {
    ...common,
    completeGrantReads: integer(
      result.completeGrantReads,
      `${path}.completeGrantReads`
    ),
    crossRequestRevocationGrace: integer(
      result.crossRequestRevocationGrace,
      `${path}.crossRequestRevocationGrace`
    ),
    sessionReads: integer(result.sessionReads, `${path}.sessionReads`),
  }
}

function parseArtifacts(value: unknown): ManagedStagingEnvelope["artifacts"] {
  const path = "artifacts"
  const result = object(value, path, [
    "behaviorFingerprint",
    "schemaChecksumsDigest",
    "schemaHead",
    "sourceCommit",
    "web",
    "worker",
  ])
  const web = object(result.web, `${path}.web`, [
    "candidateDigest",
    "previewDeploymentHash",
    "promotedDigest",
  ])
  const worker = object(result.worker, `${path}.worker`, [
    "candidateDigest",
    "previewArtifactHash",
    "promotedDigest",
  ])
  const sourceCommit = string(result.sourceCommit, `${path}.sourceCommit`)
  if (!commitPattern.test(sourceCommit)) {
    throw new Error(`${path}.sourceCommit must be a full Git commit hash`)
  }
  return {
    behaviorFingerprint: digest(
      result.behaviorFingerprint,
      `${path}.behaviorFingerprint`
    ),
    schemaChecksumsDigest: digest(
      result.schemaChecksumsDigest,
      `${path}.schemaChecksumsDigest`
    ),
    schemaHead: string(result.schemaHead, `${path}.schemaHead`),
    sourceCommit,
    web: {
      candidateDigest: digest(
        web.candidateDigest,
        `${path}.web.candidateDigest`
      ),
      previewDeploymentHash: digest(
        web.previewDeploymentHash,
        `${path}.web.previewDeploymentHash`
      ),
      promotedDigest: digest(web.promotedDigest, `${path}.web.promotedDigest`),
    },
    worker: {
      candidateDigest: digest(
        worker.candidateDigest,
        `${path}.worker.candidateDigest`
      ),
      previewArtifactHash: digest(
        worker.previewArtifactHash,
        `${path}.worker.previewArtifactHash`
      ),
      promotedDigest: digest(
        worker.promotedDigest,
        `${path}.worker.promotedDigest`
      ),
    },
  }
}

function parseCoverage(value: unknown): ManagedStagingEnvelope["coverage"] {
  const path = "coverage"
  const result = object(value, path, [
    "boundedCollections",
    "completeExports",
    "scopeManifestDigest",
  ])
  const boundedCollections = array(
    result.boundedCollections,
    `${path}.boundedCollections`
  ).map((entry, index) => {
    const entryPath = `${path}.boundedCollections[${index}]`
    const collection = object(entry, entryPath, [
      "available",
      "capPlusOneProven",
      "limit",
      "name",
      "returned",
      "searchBeforeLimitProven",
      "truncated",
    ])
    return {
      available: integer(collection.available, `${entryPath}.available`),
      capPlusOneProven: boolean(
        collection.capPlusOneProven,
        `${entryPath}.capPlusOneProven`
      ),
      limit: integer(collection.limit, `${entryPath}.limit`),
      name: string(collection.name, `${entryPath}.name`),
      returned: integer(collection.returned, `${entryPath}.returned`),
      searchBeforeLimitProven: boolean(
        collection.searchBeforeLimitProven,
        `${entryPath}.searchBeforeLimitProven`
      ),
      truncated: boolean(collection.truncated, `${entryPath}.truncated`),
    }
  })
  const completeExports = array(
    result.completeExports,
    `${path}.completeExports`
  ).map((entry, index) => {
    const entryPath = `${path}.completeExports[${index}]`
    const exportEvidence = object(entry, entryPath, [
      "canonicalFingerprint",
      "exportedFingerprint",
      "exportedRows",
      "maximumPageRows",
      "name",
      "pageLimit",
      "sourceRows",
    ])
    return {
      canonicalFingerprint: digest(
        exportEvidence.canonicalFingerprint,
        `${entryPath}.canonicalFingerprint`
      ),
      exportedFingerprint: digest(
        exportEvidence.exportedFingerprint,
        `${entryPath}.exportedFingerprint`
      ),
      exportedRows: integer(
        exportEvidence.exportedRows,
        `${entryPath}.exportedRows`
      ),
      maximumPageRows: integer(
        exportEvidence.maximumPageRows,
        `${entryPath}.maximumPageRows`
      ),
      name: string(exportEvidence.name, `${entryPath}.name`),
      pageLimit: integer(exportEvidence.pageLimit, `${entryPath}.pageLimit`),
      sourceRows: integer(exportEvidence.sourceRows, `${entryPath}.sourceRows`),
    }
  })
  if (boundedCollections.length === 0) {
    throw new Error(`${path}.boundedCollections is required`)
  }
  if (completeExports.length === 0) {
    throw new Error(`${path}.completeExports is required`)
  }
  return {
    boundedCollections,
    completeExports,
    scopeManifestDigest: digest(
      result.scopeManifestDigest,
      `${path}.scopeManifestDigest`
    ),
  }
}

function parseEnvelope(
  value: unknown,
  measuredSamples: number
): ManagedStagingEnvelope {
  const result = object(value, "record", [
    "artifacts",
    "benchmark",
    "capturedAt",
    "coverage",
    "environment",
    "freshness",
    "health",
    "operations",
    "redacted",
    "version",
  ])
  const benchmark = object(result.benchmark, "benchmark", [
    "concurrency",
    "measuredSamples",
    "postgresComputeUnits",
    "warmupSamples",
  ])
  const operations = object(result.operations, "operations", operationNames)
  const parsedOperations = Object.fromEntries(
    operationNames.map((name) => [
      name,
      parseOperation(
        operations[name],
        `operations.${name}`,
        measuredSamples,
        name === "authorization"
      ),
    ])
  ) as ManagedStagingEnvelope["operations"]
  const freshness = object(result.freshness, "freshness", [
    "committedWriteToReadModelMs",
    "listenerRecovery",
    "notificationToWorkerClaimMs",
    "sseHintToCanonicalReadMs",
  ])
  const listenerRecovery = object(
    freshness.listenerRecovery,
    "freshness.listenerRecovery",
    ["durableWorkRecovered", "recoveredWithinMs"]
  )
  const health = object(result.health, "health", [
    "connectionHeadroomPercent",
    "failedRefreshJobs",
    "pendingRefreshJobs",
    "pendingOutbox",
    "poolWaiters",
    "retryingOutbox",
  ])
  const capturedAt = string(result.capturedAt, "capturedAt")
  if (!Number.isFinite(Date.parse(capturedAt))) {
    throw new Error("capturedAt must be an ISO-8601 timestamp")
  }
  if (result.environment !== "controlled-staging") {
    throw new Error("environment must be controlled-staging")
  }
  if (result.redacted !== true) throw new Error("redacted must be true")
  if (result.version !== 1) throw new Error("version must be 1")
  return {
    artifacts: parseArtifacts(result.artifacts),
    benchmark: {
      concurrency: integer(benchmark.concurrency, "benchmark.concurrency"),
      measuredSamples: integer(
        benchmark.measuredSamples,
        "benchmark.measuredSamples"
      ),
      postgresComputeUnits: number(
        benchmark.postgresComputeUnits,
        "benchmark.postgresComputeUnits"
      ),
      warmupSamples: integer(
        benchmark.warmupSamples,
        "benchmark.warmupSamples"
      ),
    },
    capturedAt,
    coverage: parseCoverage(result.coverage),
    environment: "controlled-staging",
    freshness: {
      committedWriteToReadModelMs: parseLatency(
        freshness.committedWriteToReadModelMs,
        "freshness.committedWriteToReadModelMs",
        measuredSamples
      ),
      listenerRecovery: {
        durableWorkRecovered: boolean(
          listenerRecovery.durableWorkRecovered,
          "freshness.listenerRecovery.durableWorkRecovered"
        ),
        recoveredWithinMs: number(
          listenerRecovery.recoveredWithinMs,
          "freshness.listenerRecovery.recoveredWithinMs"
        ),
      },
      notificationToWorkerClaimMs: parseLatency(
        freshness.notificationToWorkerClaimMs,
        "freshness.notificationToWorkerClaimMs",
        measuredSamples
      ),
      sseHintToCanonicalReadMs: parseLatency(
        freshness.sseHintToCanonicalReadMs,
        "freshness.sseHintToCanonicalReadMs",
        measuredSamples
      ),
    },
    health: {
      connectionHeadroomPercent: number(
        health.connectionHeadroomPercent,
        "health.connectionHeadroomPercent"
      ),
      failedRefreshJobs: integer(
        health.failedRefreshJobs,
        "health.failedRefreshJobs"
      ),
      pendingRefreshJobs: integer(
        health.pendingRefreshJobs,
        "health.pendingRefreshJobs"
      ),
      pendingOutbox: integer(health.pendingOutbox, "health.pendingOutbox"),
      poolWaiters: integer(health.poolWaiters, "health.poolWaiters"),
      retryingOutbox: integer(health.retryingOutbox, "health.retryingOutbox"),
    },
    operations: parsedOperations,
    redacted: true,
    version: 1,
  }
}

function requireMaximum(actual: number, maximum: number, description: string) {
  if (actual > maximum) {
    throw new Error(`${description} was ${actual}; maximum is ${maximum}`)
  }
}

function enforceThresholds(
  record: ManagedStagingEnvelope,
  config: ManagedStagingConfig
) {
  const expectedBenchmark = config.performance.benchmark
  for (const key of [
    "concurrency",
    "measuredSamples",
    "postgresComputeUnits",
    "warmupSamples",
  ] as const) {
    if (record.benchmark[key] !== expectedBenchmark[key]) {
      throw new Error(
        `benchmark.${key} must equal the managed-staging value ${expectedBenchmark[key]}`
      )
    }
  }

  const operationPolicies: Record<
    OperationName,
    { latencyP95?: number; statements?: number }
  > = {
    authorization: {
      latencyP95:
        config.performance.latencyMillisecondsP95.authorizationDatabase,
      statements: config.performance.statementMaximum.authorizationPerRequest,
    },
    commercialDesign: {
      latencyP95:
        config.performance.latencyMillisecondsP95.commercialDatabaseWorkflow,
      statements: config.performance.statementMaximum.commercialDesign,
    },
    commercialEcnGraph: {
      latencyP95:
        config.performance.latencyMillisecondsP95.commercialDatabaseWorkflow,
      statements: config.performance.statementMaximum.commercialEcnGraph,
    },
    commercialEnquiries: {
      latencyP95:
        config.performance.latencyMillisecondsP95.commercialDatabaseWorkflow,
      statements: config.performance.statementMaximum.commercialEnquiries,
    },
    commercialSales: {
      latencyP95:
        config.performance.latencyMillisecondsP95.commercialDatabaseWorkflow,
      statements: config.performance.statementMaximum.commercialSales,
    },
    commercialSearch: {
      latencyP95:
        config.performance.latencyMillisecondsP95.commercialSearchDatabase,
    },
    dashboardChanged: {
      latencyP95:
        config.performance.latencyMillisecondsP95.dashboardChangedRoute,
      statements: config.performance.statementMaximum.dashboardState,
    },
    dashboardSource: {
      latencyP95:
        config.performance.latencyMillisecondsP95.dashboardSourceDatabase,
      statements: config.performance.statementMaximum.dashboardSource,
    },
    dashboardUnchanged: {
      latencyP95:
        config.performance.latencyMillisecondsP95.dashboardUnchangedRoute,
      statements: config.performance.statementMaximum.dashboardState,
    },
    recruitmentBulkHundred: {
      latencyP95:
        config.performance.latencyMillisecondsP95.recruitmentBulkDatabase,
      statements:
        config.performance.statementMaximum.recruitmentBulkOneOrOneHundred,
    },
    recruitmentBulkOne: {
      latencyP95:
        config.performance.latencyMillisecondsP95.recruitmentBulkDatabase,
      statements:
        config.performance.statementMaximum.recruitmentBulkOneOrOneHundred,
    },
    workerIdleMinute: {
      statements: config.performance.statementMaximum.workerIdlePerMinute,
    },
  }
  for (const name of operationNames) {
    const operation = record.operations[name]
    const policy = operationPolicies[name]
    if (policy.latencyP95 !== undefined) {
      requireMaximum(
        operation.latencyMs.p95,
        policy.latencyP95,
        `${name} latency p95`
      )
    }
    if (policy.statements !== undefined) {
      requireMaximum(
        operation.statements,
        policy.statements,
        `${name} statements`
      )
    }
    requireMaximum(operation.poolWaiters, 0, `${name} pool waiters`)
    for (const plan of operation.plans) {
      requireMaximum(
        plan.temporaryBlocks.written,
        config.performance.temporaryBlocksWrittenMaximum,
        `${name} temporary blocks written`
      )
      if (plan.externalDisk) {
        throw new Error(`${name} plan used an external-disk sort or hash`)
      }
      if (plan.highVolumeSequentialScans.length > 0) {
        throw new Error(`${name} plan used a high-volume sequential scan`)
      }
    }
  }

  const packets = config.performance.packetBytesMaximum
  requireMaximum(
    record.operations.dashboardSource.packets.postgresResponse,
    packets.dashboardSourceDatabaseResponse,
    "dashboardSource PostgreSQL response bytes"
  )
  requireMaximum(
    record.operations.dashboardUnchanged.packets.httpResponse,
    packets.dashboardUnchangedResponse,
    "dashboardUnchanged HTTP response bytes"
  )
  requireMaximum(
    record.operations.dashboardChanged.packets.httpResponse,
    packets.dashboardChangedResponse,
    "dashboardChanged HTTP response bytes"
  )
  for (const name of [
    "commercialDesign",
    "commercialEcnGraph",
    "commercialEnquiries",
    "commercialSales",
    "commercialSearch",
  ] as const) {
    requireMaximum(
      record.operations[name].packets.repositoryResponse,
      packets.commercialRepositoryResponse,
      `${name} repository response bytes`
    )
  }
  for (const name of [
    "recruitmentBulkOne",
    "recruitmentBulkHundred",
  ] as const) {
    const operation = record.operations[name]
    requireMaximum(
      operation.packets.httpRequest + operation.packets.httpResponse,
      packets.recruitmentBulkRequestAndResponse,
      `${name} combined request and response bytes`
    )
  }
  const statementGrowth =
    record.operations.recruitmentBulkHundred.statements -
    record.operations.recruitmentBulkOne.statements
  requireMaximum(statementGrowth, 1, "recruitment statement growth")

  const authorization = record.operations.authorization
  requireMaximum(authorization.sessionReads, 1, "authorization session reads")
  requireMaximum(
    authorization.completeGrantReads,
    1,
    "authorization complete-grant reads"
  )
  requireMaximum(
    authorization.crossRequestRevocationGrace,
    0,
    "authorization cross-request revocation grace"
  )

  const freshness = config.performance.freshnessMilliseconds
  requireMaximum(
    record.freshness.notificationToWorkerClaimMs.p99,
    freshness.notificationToWorkerClaimP99,
    "notificationToWorkerClaimMs p99"
  )
  requireMaximum(
    record.freshness.notificationToWorkerClaimMs.p95,
    freshness.notificationToWorkerClaimP95,
    "notificationToWorkerClaimMs p95"
  )
  requireMaximum(
    record.freshness.committedWriteToReadModelMs.p99,
    freshness.committedWriteToReadModelP99,
    "committedWriteToReadModelMs p99"
  )
  requireMaximum(
    record.freshness.committedWriteToReadModelMs.p95,
    freshness.committedWriteToReadModelP95,
    "committedWriteToReadModelMs p95"
  )
  requireMaximum(
    record.freshness.sseHintToCanonicalReadMs.p95,
    freshness.sseHintToCanonicalReadP95,
    "sseHintToCanonicalReadMs p95"
  )
  if (!record.freshness.listenerRecovery.durableWorkRecovered) {
    throw new Error("listener recovery did not recover durable work")
  }
  requireMaximum(
    record.freshness.listenerRecovery.recoveredWithinMs,
    config.performance.pollingMilliseconds.workerSafetySweep,
    "listener recovery milliseconds"
  )

  const health = config.observability.thresholds
  if (
    record.health.connectionHeadroomPercent <
    health.connectionHeadroomPercentMinimum
  ) {
    throw new Error(
      `connection headroom was ${record.health.connectionHeadroomPercent}; minimum is ${health.connectionHeadroomPercentMinimum}`
    )
  }
  requireMaximum(
    record.health.failedRefreshJobs,
    health.failedRefreshJobs - 1,
    "failed refresh jobs"
  )
  requireMaximum(
    record.health.retryingOutbox,
    health.retryingOutbox - 1,
    "retrying outbox rows"
  )
  requireMaximum(
    record.health.poolWaiters,
    health.poolWaiting - 1,
    "health pool waiters"
  )
  requireMaximum(record.health.pendingRefreshJobs, 0, "pending refresh jobs")
  requireMaximum(record.health.pendingOutbox, 0, "pending outbox rows")

  if (
    record.artifacts.web.candidateDigest !== record.artifacts.web.promotedDigest
  ) {
    throw new Error("web artifact was rebuilt between preview and promotion")
  }
  if (
    record.artifacts.worker.candidateDigest !==
    record.artifacts.worker.promotedDigest
  ) {
    throw new Error("worker artifact was rebuilt between preview and promotion")
  }
  if (
    record.artifacts.behaviorFingerprint !==
    expectedBehaviorFingerprint.candidateDigest
  ) {
    throw new Error("behavior fingerprint differs from the candidate artifact")
  }
  const collectionNames = new Set<string>()
  for (const collection of record.coverage.boundedCollections) {
    if (collectionNames.has(collection.name)) {
      throw new Error(`duplicate bounded collection ${collection.name}`)
    }
    collectionNames.add(collection.name)
    if (
      !collection.capPlusOneProven ||
      !collection.searchBeforeLimitProven ||
      !collection.truncated ||
      collection.available < collection.limit + 1 ||
      collection.returned !== collection.limit
    ) {
      throw new Error(
        `${collection.name} does not prove cap + 1 coverage and search-before-limit`
      )
    }
  }
  const exportNames = new Set<string>()
  for (const exportEvidence of record.coverage.completeExports) {
    if (exportNames.has(exportEvidence.name)) {
      throw new Error(`duplicate complete export ${exportEvidence.name}`)
    }
    exportNames.add(exportEvidence.name)
    if (exportEvidence.exportedRows !== exportEvidence.sourceRows) {
      throw new Error(
        `${exportEvidence.name} exportedRows must equal sourceRows`
      )
    }
    if (
      exportEvidence.exportedFingerprint !== exportEvidence.canonicalFingerprint
    ) {
      throw new Error(
        `${exportEvidence.name} exported fingerprint differs from canonical`
      )
    }
    requireMaximum(
      exportEvidence.maximumPageRows,
      exportEvidence.pageLimit,
      `${exportEvidence.name} maximum page rows`
    )
    requireMaximum(
      exportEvidence.pageLimit,
      500,
      `${exportEvidence.name} page limit`
    )
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left === right ? 0 : left < right ? -1 : 1))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  }
  return value
}

async function readManagedStagingConfig(): Promise<ManagedStagingConfig> {
  return JSON.parse(await readFile(configPath, "utf8")) as ManagedStagingConfig
}

export async function readCandidateSchemaContract() {
  const names = (await readdir(migrationsPath))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((left, right) => (left === right ? 0 : left < right ? -1 : 1))
  const head = names.at(-1)
  if (!head) throw new Error("Candidate artifact has no database migrations")
  const combined = createHash("sha256")
  for (const name of names) {
    const contents = (
      await readFile(resolve(migrationsPath, name), "utf8")
    ).replaceAll("\r\n", "\n")
    const checksum = createHash("sha256").update(contents).digest("hex")
    combined.update(`${name}:${checksum}\n`)
  }
  return { checksumsDigest: combined.digest("hex"), head }
}

export async function validateManagedStagingEnvelope(value: unknown) {
  const config = await readManagedStagingConfig()
  const measuredSamples = config.performance.benchmark.measuredSamples
  const record = parseEnvelope(value, measuredSamples)
  enforceThresholds(record, config)
  const schema = await readCandidateSchemaContract()
  if (record.artifacts.schemaHead !== schema.head) {
    throw new Error("schema head differs from the candidate artifact")
  }
  if (record.artifacts.schemaChecksumsDigest !== schema.checksumsDigest) {
    throw new Error("schema checksums differ from the candidate artifact")
  }
  const recordDigest = createHash("sha256")
    .update(JSON.stringify(canonicalize(record)))
    .digest("hex")
  return { record, recordDigest }
}
