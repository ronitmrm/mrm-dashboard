import { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import {
  connectionTargetSummary,
  createBoundedPostgresPool,
  repositoryPool,
  summarizeManagedPostgresEnvironment,
  validateManagedPostgresUrl,
} from "./postgres-runtime"

describe("managed PostgreSQL runtime contract", () => {
  it("reuses an injected pool without letting a repository close it", async () => {
    const shared = new Pool({
      connectionString: "postgres://local:local@localhost:5434/mrmpl",
      max: 2,
    })
    const end = vi.spyOn(shared, "end")

    const owned = repositoryPool({ pool: shared })

    expect(owned.pool).toBe(shared)
    await owned.close()
    expect(end).not.toHaveBeenCalled()
    await shared.end()
  })

  it("creates a bounded pool with redacted metrics", async () => {
    const pool = createBoundedPostgresPool({
      applicationName: "mrm-web",
      connectionString: "postgres://local:local@localhost:5434/mrmpl",
      max: 3,
    })

    expect(pool.options.max).toBe(3)
    expect(pool.options.connectionTimeoutMillis).toBeGreaterThan(0)
    expect(pool.options.idleTimeoutMillis).toBeGreaterThan(0)
    expect(connectionTargetSummary(pool)).toEqual({
      idle: 0,
      total: 0,
      waiting: 0,
    })
    expect(JSON.stringify(connectionTargetSummary(pool))).not.toContain(
      "localhost"
    )
    await pool.end()
  })

  it("uses native pg for long-lived managed runtimes", async () => {
    const pool = createBoundedPostgresPool({
      applicationName: "mrm-web",
      connectionString:
        "postgresql://mrmpl_staging_web:secret@example-pooler.neon.tech/neondb?sslmode=require",
      max: 2,
    })

    expect(pool).toBeInstanceOf(Pool)
    await pool.end()
  })

  it("rejects local, plaintext, pooled migration, and role-mismatched targets", () => {
    const direct =
      "postgresql://mrmpl_staging_migration:secret@example.neon.tech/neondb?sslmode=require"

    expect(
      validateManagedPostgresUrl(direct, {
        direct: true,
        responsibility: "migration",
      }).endpointClass
    ).toBe("direct")

    expect(() =>
      validateManagedPostgresUrl(
        "postgres://mrmpl_staging_web:secret@localhost:5434/mrmpl",
        { responsibility: "web" }
      )
    ).toThrow(/local/i)
    expect(() =>
      validateManagedPostgresUrl(
        "postgres://mrmpl_staging_web:secret@example.neon.tech/neondb",
        { responsibility: "web" }
      )
    ).toThrow(/TLS/i)
    expect(() =>
      validateManagedPostgresUrl(
        "postgres://mrmpl_staging_web:secret@example.com/neondb?sslmode=require",
        { responsibility: "web" }
      )
    ).toThrow(/Neon/i)
    expect(() =>
      validateManagedPostgresUrl(
        "postgresql://mrmpl_staging_migration:secret@example-pooler.neon.tech/neondb?sslmode=require",
        { direct: true, responsibility: "migration" }
      )
    ).toThrow(/direct/i)
    expect(() =>
      validateManagedPostgresUrl(direct, { responsibility: "web" })
    ).toThrow(/web/i)
  })

  it("summarizes separately scoped managed identities without values", () => {
    const target = (responsibility: string, pooled = false) =>
      `postgresql://mrmpl_staging_${responsibility}:secret@example${pooled ? "-pooler" : ""}.neon.tech/neondb?sslmode=require`

    const summary = summarizeManagedPostgresEnvironment({
      MIGRATION_DATABASE_URL: target("migration"),
      REPORTING_DATABASE_URL: target("reporting", true),
      TEST_DATABASE_URL: target("test"),
      WEB_DATABASE_URL: target("web", true),
      WORKER_DATABASE_URL: target("worker"),
    })

    expect(summary).toEqual({
      migration: { endpointClass: "direct", present: true, tls: true },
      reporting: { endpointClass: "pooled", present: true, tls: true },
      test: { endpointClass: "direct", present: true, tls: true },
      web: { endpointClass: "pooled", present: true, tls: true },
      worker: { endpointClass: "direct", present: true, tls: true },
    })
    expect(JSON.stringify(summary)).not.toContain("secret")
  })
})
