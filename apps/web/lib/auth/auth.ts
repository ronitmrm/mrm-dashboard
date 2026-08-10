import { randomUUID } from "node:crypto"

import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { createDatabase, identitySchema } from "@workspace/db"
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
  auditUserAdministration,
  baseURL,
  database,
  secret,
}: {
  allowSignUp: boolean
  auditUserAdministration: (input: {
    actorUserId: string
    banned?: boolean
    path: string
    reason?: string
    role?: string | null
    userId: string
  }) => Promise<void>
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
    databaseHooks: {
      user: {
        update: {
          after: async (user, context) => {
            const actorUserId = context?.context.session?.user.id
            const path = context?.path
            if (!actorUserId || !path) return
            const statusChange =
              path === "/admin/ban-user" || path === "/admin/unban-user"
            if (!statusChange && path !== "/admin/set-role") return
            const body =
              typeof context.body === "object" && context.body !== null
                ? (context.body as Record<string, unknown>)
                : {}
            await auditUserAdministration({
              actorUserId,
              banned:
                typeof user.banned === "boolean" ? user.banned : undefined,
              path,
              reason:
                typeof body.banReason === "string" ? body.banReason : undefined,
              role: typeof user.role === "string" ? user.role : null,
              userId: user.id,
            })
          },
        },
      },
    },
    emailAndPassword: {
      disableSignUp: !allowSignUp,
      enabled: true,
      minPasswordLength: 12,
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
    auditUserAdministration: async (input) => {
      const statusChange =
        input.path === "/admin/ban-user" || input.path === "/admin/unban-user"
      await connection.pool.query(
        `INSERT INTO audit.events (
           event_type, target_schema, target_table, target_id, actor_user_id,
           reason, metadata, source_system, source_table, source_id
         ) VALUES ($1, 'identity', 'users', $2, $3, $4, $5,
           'mrm-dashboard', 'better_auth_administration', $6)`,
        [
          statusChange
            ? "access.user.status_changed"
            : "access.user.role_changed",
          input.userId,
          input.actorUserId,
          input.reason ?? null,
          {
            banned: input.banned ?? null,
            path: input.path,
            role: input.role ?? null,
          },
          randomUUID(),
        ]
      )
    },
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

  if (postgres.hosted && baseURL.protocol !== "https:") {
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
    ...environment,
    pool: environment.hosted ? getWebPostgresPool() : undefined,
  })
  return runtimeAuth.auth
}
