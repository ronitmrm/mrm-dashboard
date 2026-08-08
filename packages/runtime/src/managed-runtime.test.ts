import { describe, expect, it } from "vitest"

import {
  readWorkerListenerPostgresEnvironment,
  readWorkerPostgresEnvironment,
} from "./managed-runtime"

describe("worker PostgreSQL environment", () => {
  it("requires a separate bounded worker identity in hosted mode", () => {
    const connectionString =
      "postgresql://mrmpl_staging_worker:secret@example.neon.tech/neondb?sslmode=require"

    expect(
      readWorkerPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WORKER_DATABASE_POOL_MAX: "2",
        WORKER_DATABASE_URL: connectionString,
      })
    ).toEqual({ connectionString, hosted: true, max: 2 })

    expect(() =>
      readWorkerPostgresEnvironment({ MRM_MANAGED_RUNTIME: "1" })
    ).toThrow(/WORKER_DATABASE_URL/)
    expect(() =>
      readWorkerPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WORKER_DATABASE_URL:
          "postgresql://mrmpl_staging_web:secret@example.neon.tech/neondb?sslmode=require",
      })
    ).toThrow(/worker/i)
  })

  it("requires a direct TLS worker listener identity in hosted mode", () => {
    const connectionString =
      "postgresql://mrmpl_staging_worker:secret@example.neon.tech/neondb?sslmode=require"

    expect(
      readWorkerListenerPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WORKER_LISTENER_DATABASE_URL: connectionString,
      })
    ).toEqual({ connectionString, hosted: true })
    expect(() =>
      readWorkerListenerPostgresEnvironment({ MRM_MANAGED_RUNTIME: "1" })
    ).toThrow(/WORKER_LISTENER_DATABASE_URL/)
    expect(() =>
      readWorkerListenerPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WORKER_LISTENER_DATABASE_URL:
          "postgresql://mrmpl_staging_worker:secret@example-pooler.neon.tech/neondb?sslmode=require",
      })
    ).toThrow(/direct/i)
    expect(() =>
      readWorkerListenerPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WORKER_LISTENER_DATABASE_URL:
          "postgresql://mrmpl_staging_web:secret@example.neon.tech/neondb?sslmode=require",
      })
    ).toThrow(/worker/i)
    expect(() =>
      readWorkerListenerPostgresEnvironment({
        MRM_MANAGED_RUNTIME: "1",
        WORKER_LISTENER_DATABASE_URL:
          "postgresql://mrmpl_staging_worker:secret@example.neon.tech/neondb",
      })
    ).toThrow(/TLS/i)
  })
})
