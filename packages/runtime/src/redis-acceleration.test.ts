import { describe, expect, it, vi } from "vitest"

import { consumeOptionalRateLimit } from "./durable-refresh-worker"
import {
  managedRuntimeTelemetrySnapshot,
  resetManagedRuntimeTelemetry,
  runtimeErrorCategory,
} from "./managed-telemetry"
import {
  readRedisAccelerationEnvironment,
  type RedisAcceleration,
} from "./redis-acceleration"

describe("Redis acceleration environment", () => {
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
  })

  it("fails open when disposable Redis acceleration is unavailable", async () => {
    resetManagedRuntimeTelemetry()
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
        commands: 0,
        outboxFailures: 0,
        rateLimitFallbacks: 1,
      },
    })
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
