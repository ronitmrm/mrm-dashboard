import { createHash } from "node:crypto"

import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { createDatabase, identitySchema } from "@workspace/db"
import {
  consumeOptionalRateLimit,
  readRedisAccelerationEnvironment,
  type RedisAccelerationOptions,
} from "@workspace/runtime"
import { betterAuth } from "better-auth"
import { admin } from "better-auth/plugins"
import type { Pool } from "pg"

import {
  getWebPostgresPool,
  readWebPostgresEnvironment,
} from "../postgres-runtime"

type CreateAuthSystemOptions = {
  allowSignUp?: boolean
  baseURL: string
  connectionString?: string
  pool?: Pool
  redisUrl?: string
  secret: string
  upstashRedisRestToken?: string
  upstashRedisRestUrl?: string
}

type AuthEnvironment = Record<string, string | undefined>

type RateLimitConsumer = typeof consumeOptionalRateLimit

export function createAuthRateLimitStorage(
  redisOptions: RedisAccelerationOptions | string,
  consume: RateLimitConsumer = consumeOptionalRateLimit
) {
  const options =
    typeof redisOptions === "string"
      ? { redisUrl: redisOptions }
      : redisOptions
  return {
    consume: async (key: string, rule: { max: number; window: number }) => {
      const digest = createHash("sha256").update(key).digest("hex")
      const result = await consume({
        key: `mrm:auth:rate:${digest}`,
        limit: rule.max,
        ...options,
        windowSeconds: rule.window,
      })
      return {
        allowed: result.allowed,
        retryAfter: result.retryAfterSeconds || null,
      }
    },
    get: async () => null,
    set: async () => undefined,
  }
}

function configureAuth({
  allowSignUp,
  baseURL,
  database,
  redisOptions,
  secret,
}: {
  allowSignUp: boolean
  baseURL: string
  database: ReturnType<typeof createDatabase>["database"]
  redisOptions: RedisAccelerationOptions
  secret: string
}) {
  return betterAuth({
    advanced: {
      database: {
        generateId: "uuid",
      },
    },
    baseURL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: identitySchema,
    }),
    emailAndPassword: {
      disableSignUp: !allowSignUp,
      enabled: true,
    },
    plugins: [admin()],
    rateLimit: {
      customStorage: createAuthRateLimitStorage(redisOptions),
      enabled: true,
    },
    secret,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60,
      },
    },
  })
}

type ConfiguredAuth = ReturnType<typeof configureAuth>

export type AuthSystem = {
  auth: ConfiguredAuth
  close: () => Promise<void>
  database: ReturnType<typeof createDatabase>["database"]
}

export function createAuthSystem({
  allowSignUp = false,
  baseURL,
  connectionString,
  pool,
  redisUrl = "redis://localhost:6380",
  secret,
  upstashRedisRestToken,
  upstashRedisRestUrl,
}: CreateAuthSystemOptions): AuthSystem {
  if (!pool && !connectionString) {
    throw new Error("A PostgreSQL connection is required for Better Auth")
  }
  const connection = createDatabase(
    pool ? { pool } : { connectionString: connectionString! }
  )
  const auth = configureAuth({
    allowSignUp,
    baseURL,
    database: connection.database,
    redisOptions: {
      redisUrl,
      upstashRedisRestToken,
      upstashRedisRestUrl,
    },
    secret,
  })

  return {
    auth,
    close: connection.close,
    database: connection.database,
  }
}

export function readAuthEnvironment(
  environment: AuthEnvironment = process.env
) {
  const postgres = readWebPostgresEnvironment(environment)
  const redis = readRedisAccelerationEnvironment(environment, postgres.hosted)
  const secret = environment.BETTER_AUTH_SECRET

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters")
  }

  return {
    baseURL:
      environment.BETTER_AUTH_URL ??
      environment.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3001",
    connectionString: postgres.connectionString,
    hosted: postgres.hosted,
    redisUrl: redis.redisUrl,
    secret,
    upstashRedisRestToken: redis.upstashRedisRestToken,
    upstashRedisRestUrl: redis.upstashRedisRestUrl,
  }
}

let runtimeAuth: ReturnType<typeof createAuthSystem> | undefined

export function getAuth(): AuthSystem["auth"] {
  const environment = readAuthEnvironment()
  runtimeAuth ??= createAuthSystem({
    ...environment,
    pool: environment.hosted ? getWebPostgresPool() : undefined,
  })
  return runtimeAuth.auth
}
