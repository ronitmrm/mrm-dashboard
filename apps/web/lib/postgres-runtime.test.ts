import { describe, expect, it } from "vitest"

import { getWebPostgresPool, readWebPostgresEnvironment } from "./postgres-runtime"

describe("web PostgreSQL environment", () => {
  it("keeps the explicit local development contract", () => {
    expect(
      readWebPostgresEnvironment({
        DATABASE_URL: "postgres://mrmpl:mrmpl@localhost:5434/mrmpl",
      })
    ).toEqual({
      connectionString: "postgres://mrmpl:mrmpl@localhost:5434/mrmpl",
      hosted: false,
      max: 2,
    })
  })

  it("requires a dedicated TLS web role and bounded cleanup in hosted mode", async () => {
    const connectionString =
      "postgresql://mrmpl_staging_web:secret@example.neon.tech/neondb?sslmode=require"

    expect(
      readWebPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WEB_DATABASE_POOL_MAX: "3",
        WEB_DATABASE_URL: connectionString,
      })
    ).toEqual({ connectionString, hosted: true, max: 3 })

    const pool = getWebPostgresPool({
      MRM_MANAGED_RUNTIME: "1",
      WEB_DATABASE_URL: connectionString,
    })
    expect(pool.options.idleTimeoutMillis).toBe(5_000)
    await pool.end()

    expect(() =>
      readWebPostgresEnvironment({
        DATABASE_URL: "postgres://mrmpl:mrmpl@localhost:5434/mrmpl",
        MRM_MANAGED_RUNTIME: "1",
      })
    ).toThrow(/WEB_DATABASE_URL/)
    expect(() =>
      readWebPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WEB_DATABASE_URL:
          "postgresql://mrmpl_staging_worker:secret@example.neon.tech/neondb?sslmode=require",
      })
    ).toThrow(/web/i)
  })
})
