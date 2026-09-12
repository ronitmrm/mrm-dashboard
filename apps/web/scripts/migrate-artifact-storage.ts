import {
  createArtifactStorageMigrationRepository,
  createArtifactStorageMigrationService,
} from "@workspace/db"

import {
  createGoogleCloudArtifactProvider,
  readGoogleCloudArtifactEnvironment,
} from "../lib/google-cloud-artifact-provider"
import { readWebPostgresEnvironment } from "../lib/postgres-runtime"
import { createOperatorGoogleCloudStorage } from "./operator-google-cloud-storage"

const mutationAcknowledgement = "--acknowledge-paused-artifact-writes"
const modes = ["inventory", "migrate", "reconcile", "verify"] as const
type Mode = (typeof modes)[number]
const sourceCleanup = {
  completion: "recorded-source-url-returns-404-or-410",
  deletion: "external-uploadthing-dashboard",
} as const

function arguments_(values: string[]) {
  const modeArgument = values.find((value) => value.startsWith("--mode="))
  const mode = (modeArgument?.slice("--mode=".length) ?? "inventory") as Mode
  if (!modes.includes(mode)) {
    throw new Error(`--mode must be one of ${modes.join(", ")}.`)
  }
  const limitArgument = values.find((value) => value.startsWith("--limit="))
  const limit = Number(limitArgument?.slice("--limit=".length) ?? 50)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("--limit must be an integer from 1 through 500.")
  }
  const allowed = new Set([
    mutationAcknowledgement,
    ...(modeArgument ? [modeArgument] : []),
    ...(limitArgument ? [limitArgument] : []),
  ])
  const unknown = values.find((value) => !allowed.has(value))
  if (unknown) throw new Error("Artifact migration argument is unsupported.")
  if (
    (mode === "migrate" || mode === "reconcile") &&
    !values.includes(mutationAcknowledgement)
  ) {
    throw new Error(
      `${mutationAcknowledgement} is required after pausing Artifact writes across every deployment sharing this database.`
    )
  }
  return { limit, mode }
}

function inventoryIncomplete(
  inventory: Awaited<
    ReturnType<
      ReturnType<typeof createArtifactStorageMigrationRepository>["inventory"]
    >
  >
) {
  return (
    !inventory.cleanupSchemaAvailable ||
    inventory.live.uploadThingObjects > 0 ||
    inventory.cleanup.pending > 0 ||
    inventory.metadataBlockers.length > 0 ||
    inventory.live.googleCloudStorageObjects > 0
  )
}

function operatorConnectionString() {
  // Operator-only CLI input; intentionally excluded from the web/Turbo runtime.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const explicit = process.env.OPERATOR_DATABASE_URL?.trim()
  return explicit || readWebPostgresEnvironment().connectionString
}

async function main() {
  const options = arguments_(process.argv.slice(2))
  const repository = createArtifactStorageMigrationRepository({
    connectionString: operatorConnectionString(),
  })
  try {
    if (options.mode === "inventory") {
      const inventory = await repository.inventory()
      process.stdout.write(
        `${JSON.stringify({
          integrityVerification: "not-run",
          inventory,
          mode: options.mode,
          sourceCleanup,
        })}\n`
      )
      if (inventoryIncomplete(inventory)) process.exitCode = 2
      return
    }

    const configuration = readGoogleCloudArtifactEnvironment()
    const destinationProvider = createGoogleCloudArtifactProvider(process.env, {
      storageClient: await createOperatorGoogleCloudStorage(
        configuration.projectId
      ),
    })
    const service = createArtifactStorageMigrationService({
      destinationProvider,
      repository,
    })

    if (options.mode === "verify") {
      const readiness = await service.verifyReadiness()
      process.stdout.write(
        `${JSON.stringify({ mode: options.mode, readiness, sourceCleanup })}\n`
      )
      if (!readiness.complete) process.exitCode = 2
      return
    }

    const result =
      options.mode === "migrate"
        ? await service.migrateBatch({ limit: options.limit })
        : await service.reconcile({ limit: options.limit })
    const inventory = await repository.inventory()
    process.stdout.write(
      `${JSON.stringify({ inventory, mode: options.mode, result, sourceCleanup })}\n`
    )
    if (
      result.failures.length > 0 ||
      result.remaining ||
      inventory.live.uploadThingObjects > 0 ||
      inventory.cleanup.pending > 0 ||
      inventory.metadataBlockers.length > 0
    ) {
      process.exitCode = 2
    }
  } finally {
    await repository.close()
  }
}

main().catch(() => {
  process.stderr.write("Artifact storage migration command failed.\n")
  process.exitCode = 1
})
