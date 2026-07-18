import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { createDatabase, identitySchema } from "@workspace/db"
import { betterAuth } from "better-auth"
import { admin } from "better-auth/plugins"

type CreateAuthSystemOptions = {
  allowSignUp?: boolean
  baseURL: string
  connectionString: string
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
    secret,
    session: {
      cookieCache: {
        enabled: false,
      },
    },
  })
}

type ConfiguredAuth = ReturnType<typeof configureAuth>

type AuthSystem = {
  auth: ConfiguredAuth
  close: () => Promise<void>
  database: ReturnType<typeof createDatabase>["database"]
}

export function createAuthSystem({
  allowSignUp = false,
  baseURL,
  connectionString,
  secret,
}: CreateAuthSystemOptions): AuthSystem {
  const connection = createDatabase(connectionString)
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
    secret,
  }
}

let runtimeAuth: ReturnType<typeof createAuthSystem> | undefined

export function getAuth(): AuthSystem["auth"] {
  runtimeAuth ??= createAuthSystem(readAuthEnvironment())
  return runtimeAuth.auth
}
