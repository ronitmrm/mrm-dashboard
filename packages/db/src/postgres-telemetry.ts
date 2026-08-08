import { AsyncLocalStorage } from "node:async_hooks"

import {
  recordPostgresPoolWaiters,
  recordPostgresStatement,
  serializedByteLength,
} from "@workspace/observability"
import type { Pool, PoolClient, QueryResult } from "pg"

const instrumentedPool = Symbol.for("mrm.postgres.telemetry.pool")
const instrumentedClient = Symbol.for("mrm.postgres.telemetry.client")
const poolQueryStorage = new AsyncLocalStorage<Pool>()

type Instrumented = {
  [instrumentedClient]?: boolean
  [instrumentedPool]?: boolean
}

type QueryResultLike = Pick<QueryResult, "rowCount" | "rows">

function queryRequestBytes(args: readonly unknown[]) {
  const first = args[0]
  const text =
    typeof first === "string"
      ? first
      : typeof first === "object" &&
          first !== null &&
          "text" in first &&
          typeof first.text === "string"
        ? first.text
        : ""
  const values = Array.isArray(args[1])
    ? args[1]
    : typeof first === "object" &&
        first !== null &&
        "values" in first &&
        Array.isArray(first.values)
      ? first.values
      : []
  return Buffer.byteLength(text, "utf8") + serializedByteLength(values)
}

function resultMetrics(result: unknown) {
  const results = Array.isArray(result) ? result : [result]
  let responseBytes = 0
  let rows = 0
  for (const candidate of results) {
    if (!candidate || typeof candidate !== "object" || !("rows" in candidate)) {
      continue
    }
    const queryResult = candidate as QueryResultLike
    const resultRows = Array.isArray(queryResult.rows) ? queryResult.rows : []
    responseBytes += serializedByteLength(resultRows)
    rows += queryResult.rowCount ?? resultRows.length
  }
  return { responseBytes, rows }
}

function measuredQuery(
  originalQuery: (...args: unknown[]) => unknown,
  args: unknown[],
  pool: Pool
) {
  const requestBytes = queryRequestBytes(args)
  let poolWaiters = pool.waitingCount
  let recorded = false
  const record = (result?: unknown) => {
    if (recorded) return
    recorded = true
    const metrics = resultMetrics(result)
    recordPostgresStatement({
      poolWaiters: Math.max(poolWaiters, pool.waitingCount),
      requestBytes,
      responseBytes: metrics.responseBytes,
      rows: metrics.rows,
    })
  }

  let callbackIndex = -1
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (typeof args[index] === "function") {
      callbackIndex = index
      break
    }
  }
  if (callbackIndex >= 0) {
    const callback = args[callbackIndex] as (...values: unknown[]) => unknown
    args[callbackIndex] = (error: unknown, result: unknown) => {
      record(result)
      return callback(error, result)
    }
  }

  try {
    const query = originalQuery(...args)
    poolWaiters = Math.max(poolWaiters, pool.waitingCount)
    if (
      callbackIndex < 0 &&
      query &&
      typeof query === "object" &&
      "then" in query &&
      typeof query.then === "function"
    ) {
      return Promise.resolve(query).then(
        (result) => {
          record(result)
          return result
        },
        (error) => {
          record()
          throw error
        }
      )
    }
    if (
      callbackIndex < 0 &&
      query &&
      typeof query === "object" &&
      "once" in query &&
      typeof query.once === "function"
    ) {
      query.once("end", record)
      query.once("error", () => record())
    }
    return query
  } catch (error) {
    record()
    throw error
  }
}

function instrumentPostgresClient(client: PoolClient, pool: Pool) {
  const markedClient = client as PoolClient & Instrumented
  if (markedClient[instrumentedClient]) return client
  markedClient[instrumentedClient] = true

  const originalQuery = client.query.bind(client) as (
    ...args: unknown[]
  ) => unknown
  client.query = ((...args: unknown[]) => {
    if (poolQueryStorage.getStore() === pool) return originalQuery(...args)
    return measuredQuery(originalQuery, args, pool)
  }) as PoolClient["query"]
  return client
}

export function instrumentPostgresPool(pool: Pool) {
  const markedPool = pool as Pool & Instrumented
  if (markedPool[instrumentedPool]) return pool
  if (typeof pool.connect !== "function" || typeof pool.query !== "function") {
    return pool
  }
  markedPool[instrumentedPool] = true

  const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => unknown
  const originalConnect = pool.connect.bind(pool)
  pool.query = ((...args: unknown[]) =>
    poolQueryStorage.run(pool, () =>
      measuredQuery(originalQuery, args, pool)
    )) as Pool["query"]
  pool.connect = ((
    callback?: (
      error: Error | undefined,
      client: PoolClient | undefined,
      release: (() => void) | undefined
    ) => void
  ) => {
    let poolWaiters = pool.waitingCount
    const recordWaiters = () => {
      recordPostgresPoolWaiters(Math.max(poolWaiters, pool.waitingCount))
    }
    if (callback) {
      const pending = originalConnect((error, client, release) => {
        recordWaiters()
        callback(
          error,
          client ? instrumentPostgresClient(client, pool) : undefined,
          release
        )
      })
      poolWaiters = Math.max(poolWaiters, pool.waitingCount)
      return pending
    }
    try {
      const pending = originalConnect()
      poolWaiters = Math.max(poolWaiters, pool.waitingCount)
      return pending.then(
        (client) => {
          recordWaiters()
          return instrumentPostgresClient(client, pool)
        },
        (error) => {
          recordWaiters()
          throw error
        }
      )
    } catch (error) {
      recordWaiters()
      throw error
    }
  }) as Pool["connect"]
  return pool
}
