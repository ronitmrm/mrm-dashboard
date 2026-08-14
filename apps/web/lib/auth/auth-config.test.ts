import { describe, expect, it } from "vitest"

import { createAuthSystem, readAuthEnvironment } from "./auth"

const connectionString =
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const secret = "test-only-better-auth-secret-000000000000"

describe("Better Auth security configuration", () => {
  it("stores rate limits in PostgreSQL and applies the authentication baseline", async () => {
    const system = createAuthSystem({
      baseURL: "https://dashboard.example.com",
      connectionString,
      secret,
    })

    try {
      const options = system.auth.options as {
        advanced?: { useSecureCookies?: boolean }
        emailAndPassword?: {
          disableSignUp?: boolean
          minPasswordLength?: number
        }
        rateLimit?: {
          customStorage?: unknown
          enabled?: boolean
          storage?: string
        }
        trustedOrigins?: string[]
      }

      expect(options.rateLimit).toMatchObject({
        enabled: true,
        storage: "database",
      })
      expect(options.rateLimit?.customStorage).toBeUndefined()
      expect(options.emailAndPassword).toMatchObject({
        disableSignUp: true,
        minPasswordLength: 12,
      })
      expect(options.trustedOrigins).toEqual(["https://dashboard.example.com"])
      expect(options.advanced?.useSecureCookies).toBe(true)
    } finally {
      await system.close()
    }
  })

  it("requires HTTPS and one exact public origin in hosted mode", () => {
    const hosted = {
      BETTER_AUTH_SECRET: secret,
      MRM_MANAGED_RUNTIME: "1",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      WEB_DATABASE_URL:
        "postgresql://mrmpl_staging_web:secret@example.neon.tech/neondb?sslmode=require",
    }

    expect(() =>
      readAuthEnvironment({
        ...hosted,
        BETTER_AUTH_URL: "http://dashboard.example.com",
        NEXT_PUBLIC_APP_URL: "http://dashboard.example.com",
      })
    ).toThrow(/HTTPS/)
    expect(() =>
      readAuthEnvironment({
        ...hosted,
        BETTER_AUTH_URL: "https://dashboard.example.com",
        NEXT_PUBLIC_APP_URL: "https://other.example.com",
      })
    ).toThrow(/same origin/)
    expect(
      readAuthEnvironment({
        ...hosted,
        BETTER_AUTH_URL: "https://dashboard.example.com",
        NEXT_PUBLIC_APP_URL: "https://dashboard.example.com/",
      }).baseURL
    ).toBe("https://dashboard.example.com")
  })
})
