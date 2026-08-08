import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { consumeOptionalRateLimit } from "./durable-refresh-worker"
import {
  configureManagedRuntimeTelemetry,
  managedRuntimeTelemetrySnapshot,
  resetManagedRuntimeTelemetry,
  runtimeErrorCategory,
} from "./managed-telemetry"
import {
  createRedisAcceleration,
  readRedisAccelerationEnvironment,
  serializeInvalidation,
  type RedisAcceleration,
} from "./redis-acceleration"

const nodeRedis = vi.hoisted(() => ({
  close: vi.fn(),
  eval: vi.fn().mockResolvedValue(1),
  publish: vi.fn().mockResolvedValue(1),
}))

vi.mock("redis", () => ({
  createClient: () => ({
    close: nodeRedis.close,
    eval: nodeRedis.eval,
    isOpen: true,
    on: vi.fn(),
    publish: nodeRedis.publish,
  }),
}))

const emittedTelemetry: StructuredTelemetryEvent[] = []

beforeEach(() => {
  emittedTelemetry.length = 0
  resetManagedRuntimeTelemetry()
  configureManagedRuntimeTelemetry({
    runtime: createTelemetryRuntime({
      artifactCommit: "commit-redis-boundary",
      environment: "test",
      now: () => "2026-08-08T12:00:00.000Z",
    }),
    sink: (event) => emittedTelemetry.push(event),
  })
  vi.clearAllMocks()
})

describe("Redis acceleration environment", () => {
  it("publishes the monotonic dashboard version to subscribers", () => {
    expect(
      JSON.parse(
        serializeInvalidation({
          aggregateId: "aggregate-1",
          aggregateType: "dashboard",
          idempotencyKey: "event-1",
          organizationId: "org-1",
          payload: {},
          topic: "dashboard.updated",
          version: 42,
        })
      )
    ).toMatchObject({ organizationId: "org-1", version: 42 })
  })

  it("keeps the Docker Redis URL as the local development default", () => {
    expect(readRedisAccelerationEnvironment({})).toEqual({
      hosted: false,
      redisUrl: "redis://localhost:6380",
    })
  })

  it("requires a complete HTTPS Upstash REST identity in hosted mode", () => {
    expect(
      readRedisAccelerationEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        UPSTASH_REDIS_REST_TOKEN: "secret",
        UPSTASH_REDIS_REST_URL: "https://staging-redis.upstash.io",
      })
    ).toEqual({
      hosted: true,
      upstashRedisRestToken: "secret",
      upstashRedisRestUrl: "https://staging-redis.upstash.io",
    })

    expect(() =>
      readRedisAccelerationEnvironment({ MRM_MANAGED_RUNTIME: "1" })
    ).toThrow(/UPSTASH_REDIS_REST_URL/)
    expect(() =>
      readRedisAccelerationEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        UPSTASH_REDIS_REST_TOKEN: "secret",
        UPSTASH_REDIS_REST_URL: "http://localhost:8079",
      })
    ).toThrow(/HTTPS/)
  })

  it("counts each provider command in a versioned invalidation", async () => {
    const acceleration = createRedisAcceleration({
      redisUrl: "redis://localhost:6380",
    })

    await acceleration.publishInvalidation({
      aggregateId: "aggregate-1",
      aggregateType: "dashboard",
      idempotencyKey: "event-1",
      organizationId: "organization-1",
      payload: {},
      topic: "dashboard.read_model.updated",
      version: 42,
    })

    expect(nodeRedis.eval).toHaveBeenCalledTimes(1)
    expect(nodeRedis.publish).toHaveBeenCalledTimes(1)
    expect(managedRuntimeTelemetrySnapshot().redis.commands).toBe(2)
  })

  it("counts a failed provider command attempt", async () => {
    nodeRedis.eval.mockRejectedValueOnce(new Error("provider unavailable"))
    const acceleration = createRedisAcceleration({
      redisUrl: "redis://localhost:6380",
    })

    await expect(
      acceleration.publishInvalidation({
        aggregateId: "aggregate-1",
        aggregateType: "dashboard",
        idempotencyKey: "event-failure",
        organizationId: "organization-1",
        payload: {},
        topic: "dashboard.read_model.updated",
        version: 43,
      })
    ).rejects.toThrow("provider unavailable")
    expect(managedRuntimeTelemetrySnapshot().redis.commands).toBe(1)
  })
})

describe("optional rate limiting", () => {
  it("uses an injected acceleration adapter without owning its lifecycle", async () => {
    const acceleration: RedisAcceleration = {
      close: vi.fn(),
      consumeRateLimit: vi.fn().mockResolvedValue({
        allowed: false,
        count: 3,
        retryAfterSeconds: 45,
      }),
      publishInvalidation: vi.fn(),
    }

    await expect(
      consumeOptionalRateLimit({
        key: "mrm:test",
        limit: 2,
        redisAcceleration: acceleration,
        windowSeconds: 60,
      })
    ).resolves.toEqual({
      allowed: false,
      count: 3,
      retryAfterSeconds: 45,
      source: "redis",
    })
    expect(acceleration.close).not.toHaveBeenCalled()
    expect(emittedTelemetry).toEqual([
      expect.objectContaining({
        commands: 1,
        event: "redis.acceleration",
      }),
    ])
  })

  it("fails open when disposable Redis acceleration is unavailable", async () => {
    const acceleration: RedisAcceleration = {
      close: vi.fn(),
      consumeRateLimit: vi.fn().mockRejectedValue(new Error("unavailable")),
      publishInvalidation: vi.fn(),
    }

    await expect(
      consumeOptionalRateLimit({
        key: "mrm:test",
        limit: 2,
        redisAcceleration: acceleration,
        windowSeconds: 60,
      })
    ).resolves.toEqual({
      allowed: true,
      count: null,
      retryAfterSeconds: 0,
      source: "unavailable",
    })
    expect(managedRuntimeTelemetrySnapshot()).toEqual({
      redis: {
        commands: 1,
        outboxFailures: 0,
        providerErrors: {
          authentication: 0,
          connectivity: 0,
          constraint: 0,
          timeout: 0,
          unknown: 1,
        },
        rateLimitFallbacks: 1,
      },
    })
    expect(emittedTelemetry.at(-1)).toEqual(
      expect.objectContaining({
        event: "redis.acceleration",
        providerErrors: expect.objectContaining({ unknown: 1 }),
        rateLimitFallbacks: 1,
      })
    )
  })

  it("classifies errors without retaining messages, hosts, or payloads", () => {
    expect(
      runtimeErrorCategory(new Error("connect ECONNREFUSED secret-host"))
    ).toBe("connectivity")
    expect(
      runtimeErrorCategory(new Error("password authentication failed"))
    ).toBe("authentication")
    expect(JSON.stringify(managedRuntimeTelemetrySnapshot())).not.toContain(
      "secret-host"
    )
  })
})
