import { createHash } from "node:crypto"

import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { createDatabase, identitySchema } from "@workspace/db"
import { consumeOptionalRateLimit } from "@workspace/runtime"
import { betterAuth } from "better-auth"
import { admin } from "better-auth/plugins"

type CreateAuthSystemOptions = {
  allowSignUp?: boolean
  baseURL: string
  connectionString: string
  redisUrl?: string
  secret: string
}

type AuthEnvironment = Record<string, string | undefined>

type RateLimitConsumer = typeof consumeOptionalRateLimit

export function createAuthRateLimitStorage(
  redisUrl: string,
  consume: RateLimitConsumer = consumeOptionalRateLimit
) {
  return {
    consume: async (key: string, rule: { max: number; window: number }) => {
      const digest = createHash("sha256").update(key).digest("hex")
      const result = await consume({
        key: `mrm:auth:rate:${digest}`,
        limit: rule.max,
        redisUrl,
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
  redisUrl,
  secret,
}: {
  allowSignUp: boolean
  baseURL: string
  database: ReturnType<typeof createDatabase>["database"]
  redisUrl: string
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
      customStorage: createAuthRateLimitStorage(redisUrl),
      enabled: true,
    },
    secret,
    session: {
      cookieCache: {
        enabled: false,
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
  redisUrl = "redis://localhost:6380",
  secret,
}: CreateAuthSystemOptions): AuthSystem {
  const connection = createDatabase(connectionString)
  const auth = configureAuth({
    allowSignUp,
    baseURL,
    database: connection.database,
    redisUrl,
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
  const connectionString = environment.DATABASE_URL
  const secret = environment.BETTER_AUTH_SECRET

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL authentication")
  }
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters")
  }

  return {
    baseURL:
      environment.BETTER_AUTH_URL ??
      environment.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3001",
    connectionString,
    redisUrl: environment.REDIS_URL ?? "redis://localhost:6380",
    secret,
  }
}

let runtimeAuth: ReturnType<typeof createAuthSystem> | undefined

export function getAuth(): AuthSystem["auth"] {
  runtimeAuth ??= createAuthSystem(readAuthEnvironment())
  return runtimeAuth.auth
}
