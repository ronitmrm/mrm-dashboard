import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import {
  createDatabase,
  identitySchema,
} from "@workspace/db"
import { readRedisAccelerationEnvironment } from "@workspace/runtime"
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
  secret: string
}

type AuthEnvironment = Record<string, string | undefined>

function configureAuth({
  allowSignUp,
  baseURL,
  database,
  secret,
}: {
  allowSignUp: boolean
  baseURL: string
  database: ReturnType<typeof createDatabase>["database"]
  secret: string
}) {
  const origin = new URL(baseURL).origin

  return betterAuth({
    advanced: {
      database: {
        generateId: "uuid",
      },
      useSecureCookies: origin.startsWith("https://"),
    },
    baseURL: origin,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: identitySchema,
    }),
    emailAndPassword: {
      disableSignUp: !allowSignUp,
      enabled: true,
      minPasswordLength: 6,
    },
    plugins: [admin()],
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    secret,
    session: {
      cookieCache: {
        enabled: false,
      },
    },
    trustedOrigins: [origin],
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
  secret,
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

  if (postgres.hosted && !environment.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL is required in managed runtime mode")
  }
  if (postgres.hosted && !environment.NEXT_PUBLIC_APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is required in managed runtime mode")
  }

  const baseURL = new URL(
    environment.BETTER_AUTH_URL ??
      environment.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3001"
  )
  const publicURL = new URL(environment.NEXT_PUBLIC_APP_URL ?? baseURL.origin)
  const localManagedOrigin =
    environment.MRM_LOCAL_MANAGED_RUNTIME === "1" &&
    baseURL.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(baseURL.hostname)

  if (postgres.hosted && baseURL.protocol !== "https:" && !localManagedOrigin) {
    throw new Error("BETTER_AUTH_URL must use HTTPS in managed runtime mode")
  }
  if (baseURL.origin !== publicURL.origin) {
    throw new Error(
      "BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must use the same origin"
    )
  }

  return {
    baseURL: baseURL.origin,
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
    baseURL: environment.baseURL,
    connectionString: environment.connectionString,
    pool: environment.hosted ? getWebPostgresPool() : undefined,
    secret: environment.secret,
  })
  return runtimeAuth.auth
}
