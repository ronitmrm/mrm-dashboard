import { AsyncLocalStorage } from "node:async_hooks"
import { Pool, type PoolClient, type PoolConfig } from "pg"

import { instrumentPostgresPool } from "./postgres-telemetry"

export { instrumentPostgresPool } from "./postgres-telemetry"

export type DatabaseResponsibility =
  | "migration"
  | "reporting"
  | "test"
  | "web"
  | "worker"

export type RepositoryPoolOptions =
  | { connectionString: string; pool?: never }
  | { connectionString?: never; pool: Pool }

export type ManagedPostgresTarget = {
  endpointClass: "direct" | "pooled"
  responsibility: DatabaseResponsibility
  tls: true
}

type ManagedPostgresValidation = {
  direct?: boolean
  responsibility: DatabaseResponsibility
}

type Environment = Record<string, string | undefined>

const managedDatabaseVariables: Array<{
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

const localHosts = new Set(["127.0.0.1", "::1", "localhost"])
const sharedManagedPools = new Map<string, Pool>()
const repositoryTransaction = new AsyncLocalStorage<{
  client: PoolClient
  connectionString: string | undefined
  sourcePool: Pool
  pool: Pool
}>()

function isLocalPostgresUrl(value: string) {
  try {
    return localHosts.has(new URL(value).hostname.toLowerCase())
  } catch {
    return false
  }
}

function isNeonPostgresUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().endsWith(".neon.tech")
  } catch {
    return false
  }
}

export function validateManagedPostgresUrl(
  value: string,
  { direct = false, responsibility }: ManagedPostgresValidation
): ManagedPostgresTarget {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${responsibility} database URL is invalid`)
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${responsibility} database URL must use PostgreSQL`)
  }
  if (localHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`${responsibility} database URL cannot target a local host`)
  }
  if (!url.hostname.toLowerCase().endsWith(".neon.tech")) {
    throw new Error(`${responsibility} database URL must target Neon`)
  }
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase()
  if (sslMode !== "require" && sslMode !== "verify-full") {
    throw new Error(`${responsibility} database URL must require TLS`)
  }
  const endpointClass = url.hostname.toLowerCase().includes("-pooler.")
    ? "pooled"
    : "direct"
  if (direct && endpointClass !== "direct") {
    throw new Error(`${responsibility} database URL must use a direct endpoint`)
  }
  if (!url.username.toLowerCase().includes(responsibility)) {
    throw new Error(
      `${responsibility} database URL must use its dedicated ${responsibility} role`
    )
  }

  return { endpointClass, responsibility, tls: true }
}

export function summarizeManagedPostgresEnvironment(environment: Environment) {
  return Object.fromEntries(
    managedDatabaseVariables.map(({ direct, responsibility, variable }) => {
      const value = environment[variable]
      if (!value) {
        throw new Error(`${variable} is required in managed runtime mode`)
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
  ) as Record<
    DatabaseResponsibility,
    { endpointClass: "direct" | "pooled"; present: true; tls: true }
  >
}

export function createBoundedPostgresPool({
  applicationName,
  connectionString,
  max,
}: {
  applicationName: string
  connectionString: string
  max: number
}) {
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new Error("PostgreSQL pool maximum must be a positive integer")
  }

  const neon = isNeonPostgresUrl(connectionString)
  const config: PoolConfig = {
    allowExitOnIdle: true,
    application_name: applicationName,
    connectionString,
    connectionTimeoutMillis: neon ? 30_000 : 5_000,
    idleTimeoutMillis: neon ? 300_000 : 10_000,
    max,
  }
  const pool = new Pool(config)
  pool.on("error", () => undefined)
  return instrumentPostgresPool(pool)
}

export function connectionTargetSummary(pool: Pool) {
  return {
    idle: pool.idleCount,
    total: pool.totalCount,
    waiting: pool.waitingCount,
  }
}

export function sharedManagedPostgresPool(input: {
  applicationName: string
  connectionString: string
  max: number
}) {
  const existing = sharedManagedPools.get(input.connectionString)
  if (existing) return existing

  const pool = createBoundedPostgresPool(input)
  sharedManagedPools.set(input.connectionString, pool)
  return pool
}

export async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const transaction = repositoryTransaction.getStore()
  if (transaction?.pool === pool) return operation(transaction.client)

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Repositories opened during this operation share one client and one commit.
export async function withRepositoryTransaction<T>(
  options: RepositoryPoolOptions,
  operation: () => Promise<T>
) {
  const { close, pool: sourcePool } = repositoryPool(options)
  try {
    return await withTransaction(sourcePool, async (client) => {
      const pool = new Proxy(sourcePool, {
        get(target, property) {
          if (property === "query") return client.query.bind(client)
          if (property === "connect") {
            throw new Error("Repository transactions must use withTransaction.")
          }
          return Reflect.get(target, property, target)
        },
      })
      return repositoryTransaction.run(
        { client, connectionString: options.connectionString, sourcePool, pool },
        operation
      )
    })
  } finally {
    await close()
  }
}

export function repositoryPool(options: RepositoryPoolOptions) {
  const transaction = repositoryTransaction.getStore()
  if (
    transaction &&
    (options.pool
      ? options.pool === transaction.sourcePool ||
        options.pool === transaction.pool
      : options.connectionString === transaction.connectionString)
  ) {
    return { close: async () => undefined, pool: transaction.pool }
  }

  if (options.pool) {
    return {
      close: async () => undefined,
      pool: instrumentPostgresPool(options.pool),
    }
  }

  if (!isLocalPostgresUrl(options.connectionString)) {
    return {
      close: async () => undefined,
      pool: sharedManagedPostgresPool({
        applicationName: "mrm-managed-runtime",
        connectionString: options.connectionString,
        max: 2,
      }),
    }
  }

  const pool = createBoundedPostgresPool({
    applicationName: "mrm-repository",
    connectionString: options.connectionString,
    max: 2,
  })
  return {
    close: () => pool.end(),
    pool,
  }
}
