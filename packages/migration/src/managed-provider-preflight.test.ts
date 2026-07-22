import { describe, expect, it } from "vitest"

import { buildManagedProviderPreflight } from "./managed-provider-preflight"

describe("managed provider preflight", () => {
  it("reports only redacted endpoint classes and credential presence", async () => {
    const result = await buildManagedProviderPreflight({
      MIGRATION_DATABASE_URL:
        "postgresql://mrmpl_staging_migration:secret@direct.example.neon.tech/neondb?sslmode=require",
      UPSTASH_REDIS_REST_TOKEN: "upstash-secret",
      UPSTASH_REDIS_REST_URL: "https://redis.example.upstash.io",
      WEB_DATABASE_URL:
        "postgresql://mrmpl_staging_web:secret@web-pooler.example.neon.tech/neondb?sslmode=require",
    })

    expect(result.runtime.postgres).toMatchObject({
      migration: { endpointClass: "direct", present: true, tls: true },
      web: { endpointClass: "pooled", present: true, tls: true },
      worker: { present: false },
    })
    expect(result.runtime.upstash).toEqual({
      credentialsComplete: true,
      present: true,
      transport: "https-rest",
    })
    expect(JSON.stringify(result)).not.toMatch(
      /upstash-secret|direct\.example|web-pooler\.example/
    )
  })

  it("rejects partially scoped Upstash credentials", async () => {
    await expect(
      buildManagedProviderPreflight({
        UPSTASH_REDIS_REST_URL: "https://redis.example.upstash.io",
      })
    ).rejects.toThrow(/scoped together/)
  })
})
