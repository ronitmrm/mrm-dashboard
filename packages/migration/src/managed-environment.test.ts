import { describe, expect, it } from "vitest"

import { readMigrationPostgresEnvironment } from "./managed-environment"

describe("migration PostgreSQL environment", () => {
  it("uses the repository Docker PostgreSQL target by default locally", () => {
    expect(readMigrationPostgresEnvironment({})).toEqual({
      connectionString: "postgres://mrmpl:mrmpl@localhost:5434/mrmpl",
      hosted: false,
    })
  })

  it("uses a direct, dedicated TLS identity in managed mode", () => {
    const connectionString =
      "postgresql://mrmpl_staging_migration:secret@example.neon.tech/neondb?sslmode=require"

    expect(
      readMigrationPostgresEnvironment({
        MIGRATION_DATABASE_URL: connectionString,
        MRM_MANAGED_RUNTIME: "1",
      })
    ).toEqual({ connectionString, hosted: true })
    expect(() =>
      readMigrationPostgresEnvironment({
        MIGRATION_DATABASE_URL:
          "postgresql://mrmpl_staging_migration:secret@example-pooler.neon.tech/neondb?sslmode=require",
        MRM_MANAGED_RUNTIME: "1",
      })
    ).toThrow(/direct/i)
  })
})
