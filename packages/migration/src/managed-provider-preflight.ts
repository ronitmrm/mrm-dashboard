import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  type DatabaseResponsibility,
  validateManagedPostgresUrl,
} from "@workspace/db"
import { validateUpstashRedisRestUrl } from "@workspace/runtime"

type Environment = Record<string, string | undefined>

const configPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config/managed-staging.json"
)

const postgresVariables: Array<{
  direct?: boolean
  responsibility: DatabaseResponsibility
  variable: string
}> = [
  { responsibility: "web", variable: "WEB_DATABASE_URL" },
  { responsibility: "worker", variable: "WORKER_DATABASE_URL" },
  {
    direct: true,
    responsibility: "migration",
    variable: "MIGRATION_DATABASE_URL",
  },
  { responsibility: "reporting", variable: "REPORTING_DATABASE_URL" },
  { responsibility: "test", variable: "TEST_DATABASE_URL" },
]

export async function buildManagedProviderPreflight(
  environment: Environment = process.env
) {
  const config = JSON.parse(await readFile(configPath, "utf8")) as unknown
  const postgres = Object.fromEntries(
    postgresVariables.map(({ direct, responsibility, variable }) => {
      const value = environment[variable]
      if (!value) {
        return [responsibility, { present: false }]
      }
      const target = validateManagedPostgresUrl(value, {
        direct,
        responsibility,
      })
      return [
        responsibility,
        {
          endpointClass: target.endpointClass,
          present: true,
          tls: target.tls,
        },
      ]
    })
  )

  const upstashUrl = environment.UPSTASH_REDIS_REST_URL
  const upstashToken = environment.UPSTASH_REDIS_REST_TOKEN
  if (Boolean(upstashUrl) !== Boolean(upstashToken)) {
    throw new Error("Both Upstash REST credentials must be scoped together")
  }
  if (upstashUrl) validateUpstashRedisRestUrl(upstashUrl)

  return {
    config,
    redacted: true,
    runtime: {
      postgres,
      upstash: {
        credentialsComplete: Boolean(upstashUrl && upstashToken),
        present: Boolean(upstashUrl && upstashToken),
        transport: upstashUrl ? "https-rest" : "not-loaded",
      },
    },
    secretValues: "omitted",
  }
}
