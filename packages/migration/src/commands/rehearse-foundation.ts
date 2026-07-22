import { migrateDatabase } from "@workspace/db"
import { Pool } from "pg"

import { createMigrationRun, stageConvexExport } from "../load/convex-staging"
import { stagePricingExport } from "../load/pricing-staging"
import { readMigrationPostgresEnvironment } from "../managed-environment"
import { transformPricingFoundation } from "../transform/pricing-foundation"

const [
  pricingArtifactPath,
  convexArtifactPath,
  gitCommit,
  operator,
  targetMigrationVersion,
  organizationCode,
  organizationName,
  transformationVersion,
] = process.argv.slice(2)
const { connectionString } = readMigrationPostgresEnvironment()

if (
  !connectionString ||
  !pricingArtifactPath ||
  !convexArtifactPath ||
  !gitCommit ||
  !operator ||
  !targetMigrationVersion ||
  !organizationCode ||
  !organizationName ||
  !transformationVersion
) {
  throw new Error(
    "Usage: DATABASE_URL=<postgres-url> pnpm rehearse:foundation <pricing-export.zip> <convex-export.zip> <git-commit> <operator> <target-migration-version> <organization-code> <organization-name> <transformation-version>"
  )
}

await migrateDatabase({ connectionString })

const pool = new Pool({ connectionString })
try {
  await pool.query(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      ON CONFLICT (lower(code))
      DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    `,
    [organizationCode, organizationName]
  )
} finally {
  await pool.end()
}

const migrationRunId = await createMigrationRun({
  connectionString,
  gitCommit,
  operator,
  targetMigrationVersion,
})
const pricing = await stagePricingExport({
  artifactPath: pricingArtifactPath,
  connectionString,
  migrationRunId,
})
const convex = await stageConvexExport({
  artifactPath: convexArtifactPath,
  connectionString,
  migrationRunId,
})
const pricingFoundation = await transformPricingFoundation({
  connectionString,
  migrationRunId,
  organizationCode,
  transformationVersion,
})

process.stdout.write(
  `${JSON.stringify(
    {
      convex,
      migrationRunId,
      pricing,
      pricingFoundation,
    },
    null,
    2
  )}\n`
)
