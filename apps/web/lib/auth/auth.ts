import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import {
  createDatabase,
  createAuthorizationRepository,
  identitySchema,
} from "@workspace/db"
import { readRedisAccelerationEnvironment } from "@workspace/runtime/redis-acceleration"
import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import { deleteSessionCookie } from "better-auth/cookies"
import { admin } from "better-auth/plugins"
import type { Pool } from "pg"

import { createDeviceGate, deviceBlockedMessage } from "./device-approval"
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
  pool,
  secret,
}: {
  allowSignUp: boolean
  baseURL: string
  database: ReturnType<typeof createDatabase>["database"]
  pool: Pool
  secret: string
}) {
  const origin = new URL(baseURL).origin
  const authorization = createAuthorizationRepository({ pool })
  const checkDevice = createDeviceGate(pool)

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
    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => {
            if (!(await authorization.hasActiveEmployment(session.userId))) {
              await ctx?.context.internalAdapter.deleteUserSessions(session.userId)
              throw new APIError("FORBIDDEN", { message: "This employee's company access has ended." })
            }
            if (session.impersonatedBy) return
            const device = await checkDevice({
              headers: ctx?.headers ?? ctx?.request?.headers,
              sessionId: null,
              userId: session.userId,
            })
            if (!device.allowed) {
              throw new APIError("FORBIDDEN", { message: deviceBlockedMessage(device.code) })
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const session = await getSessionFromCtx(ctx)
        if (!session) return
        if (!(await authorization.hasActiveEmployment(session.user.id))) {
          await ctx.context.internalAdapter.deleteUserSessions(session.user.id)
          deleteSessionCookie(ctx)
          if (ctx.path === "/get-session") return ctx.json(null)
          throw new APIError("UNAUTHORIZED", { message: "This employee's company access has ended." })
        }
        // Sign-in checks its own device in session.create; sign-out stays open.
        if (
          !ctx.path.startsWith("/sign-in") &&
          ctx.path !== "/sign-out" &&
          !session.session.impersonatedBy
        ) {
          const device = await checkDevice({
            headers: ctx.headers,
            sessionId: session.session.id,
            userId: session.user.id,
          })
          if (!device.allowed) {
            if (ctx.path === "/get-session") return ctx.json(null)
            throw new APIError("UNAUTHORIZED", { message: deviceBlockedMessage(device.code) })
          }
        }
        if (ctx.path === "/get-session") return ctx.json(session)
      }),
    },
    plugins: [admin()],
    rateLimit: {
      // The factory router rewrites every visitor to one source address, so the
      // whole site shares one bucket; the default 3 per 10 s blocks shift-start sign-ins.
      customRules: {
        "/sign-in/email": { max: 30, window: 10 },
      },
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
    pool: connection.pool,
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
    redisDisabled: redis.redisDisabled,
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
