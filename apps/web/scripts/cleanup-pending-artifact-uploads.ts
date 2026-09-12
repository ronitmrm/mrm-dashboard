import { createPendingArtifactUploadRepository } from "@workspace/db"

import {
  createGoogleCloudArtifactProvider,
  readGoogleCloudArtifactEnvironment,
} from "../lib/google-cloud-artifact-provider"
import { cleanupPendingArtifactUploads } from "../lib/pending-artifact-upload-server"
import { readWebPostgresEnvironment } from "../lib/postgres-runtime"
import { createOperatorGoogleCloudStorage } from "./operator-google-cloud-storage"

function cleanupLimit(arguments_: string[]) {
  const value = arguments_.find((argument) => argument.startsWith("--limit="))
  const limit = Number(value?.slice("--limit=".length) ?? 100)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit must be an integer from 1 through 500.")
  }
  return limit
}

async function main() {
  const limit = cleanupLimit(process.argv.slice(2))
  // Operator-only configuration; never consumed by the web runtime.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const operatorConnectionString = process.env.OPERATOR_DATABASE_URL?.trim()
  const repository = createPendingArtifactUploadRepository({
    connectionString:
      operatorConnectionString || readWebPostgresEnvironment().connectionString,
  })
  try {
    const configuration = readGoogleCloudArtifactEnvironment()
    const provider = createGoogleCloudArtifactProvider(process.env, {
      storageClient: await createOperatorGoogleCloudStorage(
        configuration.projectId
      ),
    })
    const result = await cleanupPendingArtifactUploads(
      { before: new Date(), limit },
      { provider, repository }
    )
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.failed) process.exitCode = 1
  } finally {
    await repository.close()
  }
}

main().catch(() => {
  process.stderr.write("Pending Artifact upload cleanup failed.\n")
  process.exitCode = 1
})
