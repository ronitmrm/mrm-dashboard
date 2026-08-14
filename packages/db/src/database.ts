import { drizzle } from "drizzle-orm/node-postgres"

import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
import * as schema from "./schema"

export function createDatabase(options: RepositoryPoolOptions | string) {
  const { close, pool } = repositoryPool(
    typeof options === "string" ? { connectionString: options } : options
  )
  const database = drizzle(pool, { schema })

  return {
    close,
    database,
    pool,
  }
}
