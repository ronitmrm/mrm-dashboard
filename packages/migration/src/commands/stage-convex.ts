import { createMigrationRun, stageConvexExport } from "../load/convex-staging"

const [artifactPath, gitCommit, operator, targetMigrationVersion] =
  process.argv.slice(2)
const connectionString = process.env.DATABASE_URL

if (
  !connectionString ||
  !artifactPath ||
  !gitCommit ||
  !operator ||
  !targetMigrationVersion
) {
  throw new Error(
    "Usage: DATABASE_URL=<postgres-url> pnpm stage:convex <convex-export.zip> <git-commit> <operator> <target-migration-version>"
  )
}

const migrationRunId = await createMigrationRun({
  connectionString,
  gitCommit,
  operator,
  targetMigrationVersion,
})
const result = await stageConvexExport({
  artifactPath,
  connectionString,
  migrationRunId,
})

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
