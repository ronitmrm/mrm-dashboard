import { Redis } from "@upstash/redis"
import { createClient } from "redis"

import { recordRedisCommand } from "./managed-telemetry"

type Environment = Record<string, string | undefined>

type RateLimitResult = {
  allowed: boolean
  count: number
  retryAfterSeconds: number
}

export type Invalidation = {
  aggregateId: string | null
  aggregateType: string
  idempotencyKey: string
  organizationId: string | null
  payload: Record<string, unknown>
  topic: string
  version?: number
}

export type RedisAcceleration = {
  close: () => Promise<void>
  consumeRateLimit: (options: {
    key: string
    limit: number
    windowSeconds: number
  }) => Promise<RateLimitResult>
  publishInvalidation: (invalidation: Invalidation) => Promise<void>
}

export type RedisAccelerationOptions = {
  onCommand?: () => void
  redisUrl?: string
  upstashRedisRestToken?: string
  upstashRedisRestUrl?: string
}

const RATE_LIMIT_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  local ttl = redis.call('TTL', KEYS[1])
  return { count, ttl }
`

const MONOTONIC_VERSION_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  local incoming = tonumber(ARGV[1])
  if incoming > current then
    redis.call('SET', KEYS[1], ARGV[1])
  end
  return math.max(current, incoming)
`

function numericPair(value: unknown) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("Redis rate-limit script returned an invalid response")
  }
  const count = Number(value[0])
  const ttl = Number(value[1])
  if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
    throw new Error("Redis rate-limit script returned non-numeric values")
  }
  return { count, ttl }
}

export function serializeInvalidation(invalidation: Invalidation) {
  return JSON.stringify({
    aggregateId: invalidation.aggregateId,
    aggregateType: invalidation.aggregateType,
    idempotencyKey: invalidation.idempotencyKey,
    organizationId: invalidation.organizationId,
    payload: invalidation.payload,
    topic: invalidation.topic,
    version: invalidation.version,
  })
}

function versionKey(organizationId: string) {
  return `mrm:dashboard:version:${organizationId}`
}

function createNodeRedisAcceleration(
  redisUrl: string,
  onCommand: () => void
): RedisAcceleration {
  const client = createClient({
    socket: {
      connectTimeout: 250,
      reconnectStrategy: false,
    },
    url: redisUrl,
  })
  client.on("error", () => undefined)

  async function connectedClient() {
    if (!client.isOpen) await client.connect()
    return client
  }

  return {
    async close() {
      if (client.isOpen) await client.close()
    },
    async consumeRateLimit({ key, limit, windowSeconds }) {
      const redis = await connectedClient()
      onCommand()
      const result = numericPair(
        await redis.eval(RATE_LIMIT_SCRIPT, {
          arguments: [String(windowSeconds)],
          keys: [key],
        })
      )
      return {
        allowed: result.count <= limit,
        count: result.count,
        retryAfterSeconds: Math.max(0, result.ttl),
      }
    },
    async publishInvalidation(invalidation) {
      const redis = await connectedClient()
      if (
        invalidation.organizationId &&
        Number.isFinite(invalidation.version)
      ) {
        onCommand()
        await redis.eval(MONOTONIC_VERSION_SCRIPT, {
          arguments: [String(invalidation.version)],
          keys: [versionKey(invalidation.organizationId)],
        })
      }
      onCommand()
      await redis.publish(
        "mrm:invalidations",
        serializeInvalidation(invalidation)
      )
    },
  }
}

function createUpstashAcceleration({
  onCommand,
  token,
  url,
}: {
  token: string
  url: string
  onCommand: () => void
}): RedisAcceleration {
  const redis = new Redis({ token, url })

  return {
    async close() {},
    async consumeRateLimit({ key, limit, windowSeconds }) {
      onCommand()
      const result = numericPair(
        await redis.eval(RATE_LIMIT_SCRIPT, [key], [String(windowSeconds)])
      )
      return {
        allowed: result.count <= limit,
        count: result.count,
        retryAfterSeconds: Math.max(0, result.ttl),
      }
    },
    async publishInvalidation(invalidation) {
      if (
        invalidation.organizationId &&
        Number.isFinite(invalidation.version)
      ) {
        onCommand()
        await redis.eval(
          MONOTONIC_VERSION_SCRIPT,
          [versionKey(invalidation.organizationId)],
          [String(invalidation.version)]
        )
      }
      onCommand()
      await redis.publish(
        "mrm:invalidations",
        serializeInvalidation(invalidation)
      )
    },
  }
}

export function validateUpstashRedisRestUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:") {
    throw new Error("UPSTASH_REDIS_REST_URL must use HTTPS")
  }
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  ) {
    throw new Error("UPSTASH_REDIS_REST_URL cannot target localhost")
  }
  return url
}

export function readRedisAccelerationEnvironment(
  environment: Environment = process.env,
  hosted = environment.MRM_MANAGED_RUNTIME === "1" || environment.VERCEL === "1"
): RedisAccelerationOptions & { hosted: boolean } {
  if (hosted) {
    const upstashRedisRestToken = environment.UPSTASH_REDIS_REST_TOKEN
    const upstashRedisRestUrl = environment.UPSTASH_REDIS_REST_URL
    if (!upstashRedisRestToken || !upstashRedisRestUrl) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in managed runtime mode"
      )
    }
    validateUpstashRedisRestUrl(upstashRedisRestUrl)
    return { hosted, upstashRedisRestToken, upstashRedisRestUrl }
  }

  return {
    hosted,
    redisUrl: environment.REDIS_URL ?? "redis://localhost:6380",
  }
}

export function createRedisAcceleration({
  onCommand = recordRedisCommand,
  redisUrl,
  upstashRedisRestToken,
  upstashRedisRestUrl,
}: RedisAccelerationOptions): RedisAcceleration {
  const safeOnCommand = () => {
    try {
      onCommand()
    } catch {
      // Telemetry must not alter Redis acceleration behavior.
    }
  }
  if (upstashRedisRestToken || upstashRedisRestUrl) {
    if (!upstashRedisRestToken || !upstashRedisRestUrl) {
      throw new Error(
        "Both Upstash REST credentials are required for managed Redis"
      )
    }
    validateUpstashRedisRestUrl(upstashRedisRestUrl)
    return createUpstashAcceleration({
      onCommand: safeOnCommand,
      token: upstashRedisRestToken,
      url: upstashRedisRestUrl,
    })
  }
  if (!redisUrl) {
    throw new Error(
      "A local Redis URL or Upstash REST credentials are required"
    )
  }
  return createNodeRedisAcceleration(redisUrl, safeOnCommand)
}
