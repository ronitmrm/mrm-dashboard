import { readFile } from "node:fs/promises"
import { createProductionOpeningRepository } from "@workspace/db"
import { readMigrationPostgresEnvironment } from "../managed-environment"

const path = process.argv[2]
const organizationId = process.env.OPENING_ORGANIZATION_ID
if (!path || !organizationId) throw new Error("Usage: cnc:opening <reviewed.json> [--commit], with OPENING_ORGANIZATION_ID set.")
const repository = createProductionOpeningRepository(readMigrationPostgresEnvironment())
try {
  const result = await repository.importBatch({
    organizationId,
    batch: JSON.parse(await readFile(path, "utf8")),
    commit: process.argv.includes("--commit"),
  })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  // Never print driver configuration or connection strings.
  console.error(error instanceof Error ? error.message : "Opening import failed.")
  process.exitCode = 1
} finally {
  await repository.close()
}
