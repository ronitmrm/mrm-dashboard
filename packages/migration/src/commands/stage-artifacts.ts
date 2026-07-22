import { createMigrationRun, stageConvexExport } from "../load/convex-staging"
import { stagePricingExport } from "../load/pricing-staging"
import { readMigrationPostgresEnvironment } from "../managed-environment"

const [
  pricingArtifactPath,
  convexArtifactPath,
  gitCommit,
  operator,
  targetMigrationVersion,
] = process.argv.slice(2)
const { connectionString } = readMigrationPostgresEnvironment()

if (
  !connectionString ||
  !pricingArtifactPath ||
  !convexArtifactPath ||
  !gitCommit ||
  !operator ||
  !targetMigrationVersion
) {
  throw new Error(
    "Usage: DATABASE_URL=<postgres-url> pnpm stage:artifacts <pricing-export.zip> <convex-export.zip> <git-commit> <operator> <target-migration-version>"
  )
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

process.stdout.write(
  `${JSON.stringify(
    {
      convex,
      migrationRunId,
      pricing,
    },
    null,
    2
  )}\n`
)
